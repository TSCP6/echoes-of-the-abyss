import { describe, expect, it, vi } from 'vitest';
import type { Scene } from 'phaser';
import { LevelDeviceSystem } from '../../../../src/game/systems/world/levelDeviceSystem';
import type { LevelDevice } from '../../../../src/game/domain/combat/levelDevices';
import type { PlayerController } from '../../../../src/game/systems/player/playerController';

vi.mock('phaser', () => ({ Physics: {} }));
vi.mock('../../../../src/game/systems/presentation/audioDirector', () => ({ audioDirector: { playSfx() {} } }));
vi.mock('../../../../src/game/domain/player/settingsStore', () => ({ settingsStore: { getSnapshot: () => ({ keymap: null }) } }));

function fixture(kind: LevelDevice['kind'], height = 32) {
    const objects: Array<Record<string, any>> = [];
    const make = (values = {}) => {
        const object: Record<string, any> = { ...values };
        for (const name of ['setDepth', 'setOrigin', 'setVisible', 'setFillStyle', 'setStrokeStyle', 'setAlpha', 'setPosition', 'setText', 'setColor', 'destroy']) {
            object[name] = vi.fn(() => object);
        }
        objects.push(object);
        return object;
    };
    const scene = {
        add: { rectangle: (x: number, y: number, width: number, height: number) => make({ x, y, width, height }), text: () => make() },
        physics: { add: { existing: (o: Record<string, any>) => { o.body = { enable: true, checkCollision: {} }; }, collider: () => ({ destroy() {} }) } },
        time: { now: 0 }
    } as unknown as Scene;
    const player = { sprite: { x: 0, y: 0 }, body: { bottom: 0, left: 0, right: 22, velocity: { y: 0 } } } as unknown as PlayerController;
    const def: LevelDevice = { id: 'test', kind, x: 100, y: 100, width: 96, height, group: 'test', order: 0, label: '符文' };
    return { system: new LevelDeviceSystem(scene, player, [def]), objects, def };
}

describe('机关呈现与地图契约', () => {
    it('开关状态不变时不会逐帧重绘文字纹理', () => {
        const f = fixture('switch');
        f.system.update(1 / 60, false);
        const label = f.objects[1];
        label.setColor.mockClear();
        for (let i = 0; i < 60; i++) { f.system.update(1 / 60, false); }
        expect(label.setColor).not.toHaveBeenCalled();
        f.system.state.activate('test', 100, 100);
        f.system.update(1 / 60, false);
        expect(label.setColor).toHaveBeenCalledTimes(1);
    });
    it('薄脆桥真实物理顶面与 Tiled 对象的 y 坐标一致', () => {
        const f = fixture('crumble', 2);
        const shape = f.objects[0];
        expect(shape.height).toBe(2);
        expect(shape.y - shape.height / 2).toBe(f.def.y);
    });
});
