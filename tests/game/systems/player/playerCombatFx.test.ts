import { describe, expect, it } from 'vitest';
import type { Scene } from 'phaser';
import type { PlayerController } from '../../../../src/game/systems/player/playerController';
import { PlayerCombatFx } from '../../../../src/game/systems/player/playerCombatFx';
import { PLAYER_SKILL_ART, PLAYER_WEAPON_ART } from '../../../../src/game/data/playerCombatArt';
import { WEAPONS } from '../../../../src/game/data/weapons';
import { SKILLS } from '../../../../src/game/data/skills';

function harness() {
    const nodes: { calls: { name: string; args: unknown[] }[]; destroyed: boolean }[] = [];
    const graphics = () => {
        const record = { calls: [] as { name: string; args: unknown[] }[], destroyed: false };
        nodes.push(record);
        const g: unknown = new Proxy({}, { get: (_, name: string) => (...args: unknown[]) => {
            if (name === 'clear') { record.calls = []; }
            else if (name === 'destroy') { record.destroyed = true; }
            else { record.calls.push({ name, args }); }
            return g;
        } });
        return g;
    };
    const player = { sprite: { active: true, x: 80, y: 100 }, body: { center: { x: 80, y: 100 } },
        getFacing: () => 1, getState: () => 'idle' };
    const scene = { add: { graphics }, events: { once() {}, off() {} } };
    return { fx: new PlayerCombatFx(scene as unknown as Scene, player as unknown as PlayerController), nodes, player };
}

describe('玩家战斗呈现', () => {
    it('六件武器和二十一技能均有显式呈现映射', () => {
        expect(Object.keys(PLAYER_WEAPON_ART).sort()).toEqual(WEAPONS.map(w => w.id).sort());
        expect(Object.keys(PLAYER_SKILL_ART).sort()).toEqual(SKILLS.map(s => s.id).sort());
        for (const skill of SKILLS) { expect(PLAYER_SKILL_ART[skill.id]?.kind === 'passive').toBe(skill.kind === 'passive'); }
    });
    it('近战绘制始终位于真实攻击盒内部，移动玩家不移动已发起的攻击盒', () => {
        for (const weapon of WEAPONS.filter(w => w.type === 'melee')) {
            for (const facing of [1, -1]) {
                const { fx, nodes, player } = harness();
                player.getFacing = () => facing;
                const rect = { x: 15, y: 25, width: 32, height: 28 };
                fx.weapon(weapon, rect, 0.2);
                player.body.center.x = 600;
                for (let frame = 0; frame < 8; frame++) {
                    fx.update(0.02);
                    const points = nodes[1]!.calls.filter(c => c.name === 'moveTo' || c.name === 'lineTo');
                    expect(points.length).toBeGreaterThan(0);
                    for (const point of points) {
                        expect(point.args[0]).toBeGreaterThanOrEqual(rect.x);
                        expect(point.args[0]).toBeLessThanOrEqual(rect.x + rect.width);
                        expect(point.args[1]).toBeGreaterThanOrEqual(rect.y);
                        expect(point.args[1]).toBeLessThanOrEqual(rect.y + rect.height);
                    }
                }
            }
        }
    });
    it('被动不会伪造施法，提示等待恢复后的update再计时', () => {
        const { fx, nodes } = harness();
        fx.skill('sk_blade_focus', { damagePct: 8 });
        fx.update(0);
        expect(nodes[1]!.calls).toEqual([]);
        fx.passive('sk_blade_focus');
        fx.update(0);
        expect(nodes[1]!.calls.length).toBeGreaterThan(0);
        fx.update(1);
        expect(nodes[1]!.calls).toEqual([]);
    });
    it('只创建两个图形对象，清理与销毁后没有残留效果', () => {
        const { fx, nodes } = harness();
        for (let i = 0; i < 200; i++) { fx.skill('sk_blade_storm', { radius: 120 }); }
        fx.update(0);
        expect(nodes).toHaveLength(2);
        expect(nodes[1]!.calls.length).toBeLessThan(2000);
        fx.clear();
        expect(nodes.every(n => n.calls.length === 0)).toBe(true);
        fx.destroy(); fx.destroy(); fx.update(1);
        expect(nodes.every(n => n.destroyed)).toBe(true);
    });
    it('持握主手不覆盖副手射击动画，动画结束恢复主手', () => {
        const { fx, nodes } = harness();
        fx.setEquipped(WEAPONS[0]!);
        fx.weapon(WEAPONS[4]!);
        fx.setEquipped(WEAPONS[0]!);
        fx.update(0.02);
        expect(nodes[0]!.calls.some(c => c.name === 'fillStyle' && c.args[0] === PLAYER_WEAPON_ART.wpn_dartgun!.color)).toBe(true);
        fx.update(1);
        expect(nodes[0]!.calls.some(c => c.name === 'fillStyle' && c.args[0] === PLAYER_WEAPON_ART.wpn_shortsword!.color)).toBe(true);
    });
    it('冲刺残影只采样真实位置，不按配置距离伪造路径', () => {
        const { fx, nodes, player } = harness();
        fx.skill('sk_dash', { dashDistance: 180, invincibleMs: 200 });
        fx.update(0.01);
        player.body.center.x = 91;
        fx.update(0.02);
        const ellipses = nodes[1]!.calls.filter(c => c.name === 'fillEllipse');
        expect(ellipses.map(c => c.args[0])).toEqual([80, 91]);
        expect(ellipses.map(c => c.args[1])).toEqual([99, 99]);
        player.getState = () => 'dead';
        fx.update(0.01);
        expect(nodes.every(n => n.calls.length === 0)).toBe(true);
    });
    it('九种主动技能均绘制可见效果并在结束后回收', () => {
        for (const skill of SKILLS.filter(s => s.kind === 'active')) {
            const { fx, nodes } = harness();
            fx.skill(skill.id, skill.effect);
            fx.update(0.01);
            expect(nodes[1]!.calls.some(c => ['fillPath', 'fillCircle', 'fillTriangle', 'fillRect', 'fillEllipse', 'strokePath', 'lineBetween'].includes(c.name))).toBe(true);
            fx.update(2);
            expect(nodes[1]!.calls).toEqual([]);
        }
    });
    it('范围技能使用施放时角色中心，圆弧半径包含描边后不超过真实半径', () => {
        for (const id of ['sk_whirlwind', 'sk_blade_storm']) {
            const { fx, nodes, player } = harness();
            player.body.center.y = 110;
            fx.skill(id, { radius: 80 });
            player.sprite.x = 500;
            fx.update(0.1);
            const arcs = nodes[1]!.calls.filter(c => c.name === 'arc');
            expect(arcs.length).toBeGreaterThan(0);
            for (const arc of arcs) {
                expect(arc.args[0]).toBe(80);
                expect(arc.args[1]).toBe(100);
                expect((arc.args[2] as number) + 2.5).toBeLessThanOrEqual(80);
            }
        }
    });
    it('射击提示锚定实际弹丸出生点，不采用碰撞体的中心偏移', () => {
        const { fx, nodes, player } = harness();
        player.body.center.y = 110;
        player.getFacing = () => -1;
        fx.weapon(WEAPONS[4]!);
        fx.update(0.01);
        const core = nodes[1]!.calls.find(c => c.name === 'fillCircle');
        expect(core?.args.slice(0, 2)).toEqual([60, 94]);
    });
});
