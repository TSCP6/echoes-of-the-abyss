import { Physics, type GameObjects, type Scene } from 'phaser';
import { advanceCrumble, DeviceState, type CrumbleState, type LevelDevice } from '../../domain/combat/levelDevices';
import type { PlayerController } from '../player/playerController';
import { audioDirector } from '../presentation/audioDirector';
import { settingsStore } from '../../domain/player/settingsStore';
import { effectiveKeys } from '../../domain/player/keymap';

interface DeviceView {
    def: LevelDevice;
    shape: GameObjects.Rectangle;
    label: GameObjects.Text | null;
    body: Physics.Arcade.StaticBody | null;
    crumble: CrumbleState;
    switchActive: boolean | null;
}

/** 所有设施都来自 Tiled mechanisms 对象层；门与脆桥的碰撞和画面共享同一状态。 */
export class LevelDeviceSystem {
    readonly state: DeviceState;
    private views: DeviceView[] = [];
    private colliders: Physics.Arcade.Collider[] = [];
    private prompt: GameObjects.Text;
    private message: GameObjects.Text;
    private messageUntil = 0;

    constructor(private scene: Scene, private player: PlayerController, devices: readonly LevelDevice[]) {
        this.state = new DeviceState(devices);
        for (const def of devices) {
            const color = def.kind === 'gate' ? 0x546c83 : def.kind === 'crumble' ? 0xa77961 : 0x5b7787;
            const physical = def.kind === 'gate' || def.kind === 'crumble';
            const shape = scene.add.rectangle(def.x + def.width / 2, def.y + def.height / 2,
                physical ? def.width : Math.max(12, def.width), physical ? def.height : Math.max(12, def.height), color).setDepth(def.kind === 'sign' ? -2 : 3);
            shape.setStrokeStyle(2, def.kind === 'crumble' ? 0xffc191 : 0x9bdddc);
            let body: Physics.Arcade.StaticBody | null = null;
            if (def.kind === 'gate' || def.kind === 'crumble') {
                scene.physics.add.existing(shape, true);
                body = shape.body as Physics.Arcade.StaticBody;
                if (def.kind === 'crumble') {
                    body.checkCollision.down = false;
                    body.checkCollision.left = false;
                    body.checkCollision.right = false;
                }
                this.colliders.push(scene.physics.add.collider(player.sprite, shape));
            }
            const text = def.kind === 'gate' ? '封印' : def.kind === 'crumble' ? '···' : def.label;
            const label = scene.add.text(shape.x, def.kind === 'sign' ? def.y - 16 : def.y - 24, text,
                { fontSize: '14px', color: '#dce9dc', backgroundColor: '#142130dd', padding: { x: 7, y: 4 }, align: 'center' })
                .setOrigin(0.5, 1).setDepth(5);
            if (def.kind === 'sign') { shape.setVisible(false); }
            this.views.push({ def, shape, body, label, crumble: { phase: 'stable', elapsed: 0 }, switchActive: null });
        }
        this.prompt = scene.add.text(0, 0, '', { fontSize: '16px', color: '#fff3b0', backgroundColor: '#142130ee', padding: { x: 10, y: 6 } })
            .setOrigin(0.5, 1).setDepth(45).setVisible(false);
        this.message = scene.add.text(0, 0, '', { fontSize: '16px', color: '#b4f0df', stroke: '#102030', strokeThickness: 4 })
            .setOrigin(0.5).setDepth(46).setVisible(false);
    }

    update(dt: number, interact: boolean): void {
        const p = this.player.sprite;
        const switches = this.views.filter(v => v.def.kind === 'switch' && !this.state.isActive(v.def.id)
            && Math.abs(p.x - v.def.x) <= 76 && Math.abs(p.y - v.def.y) <= 88);
        switches.sort((a, b) => Math.abs(p.x - a.def.x) - Math.abs(p.x - b.def.x));
        const nearest = switches[0];
        this.prompt.setVisible(nearest !== undefined);
        if (nearest !== undefined) {
            const key = effectiveKeys('interact', settingsStore.getSnapshot().keymap)[0];
            this.prompt.setPosition(nearest.def.x + 16, nearest.def.y - 44).setText(`[${key}] ${nearest.def.label}`);
            if (interact) {
                const result = this.state.activate(nearest.def.id, p.x, p.y);
                const wrong = result === 'wrong-order';
                audioDirector.playSfx(wrong ? 'ui_error' : 'checkpoint');
                this.message.setText(wrong ? '顺序错误，请从 Ⅰ 重新激活' : '符文已点亮，封印正在回应')
                    .setPosition(p.x, p.y - 92).setVisible(true);
                this.messageUntil = this.scene.time.now + 2000;
            }
        }
        if (this.scene.time.now > this.messageUntil) { this.message.setVisible(false); }
        for (const view of this.views) {
            const { def, shape, body, label } = view;
            if (def.kind === 'switch') {
                const active = this.state.isActive(def.id);
                if (view.switchActive !== active) {
                    shape.setFillStyle(active ? 0x6ee7bb : 0x3b566f);
                    label?.setColor(active ? '#8ff5c2' : '#dce9dc');
                    view.switchActive = active;
                }
            } else if (def.kind === 'gate' && body !== null) {
                const open = this.state.isGateOpen(def);
                body.enable = !open;
                shape.setAlpha(open ? 0.12 : 0.95);
                label?.setText(open ? '封印已解除' : def.label || '点亮符文解除封印');
            } else if (def.kind === 'crumble' && body !== null) {
                const standing = Math.abs(this.player.body.bottom - def.y) < 5 && this.player.body.velocity.y >= 0
                    && this.player.body.right > def.x && this.player.body.left < def.x + def.width;
                view.crumble = advanceCrumble(view.crumble, standing, dt);
                const missing = view.crumble.phase === 'missing';
                body.enable = !missing;
                shape.setAlpha(missing ? 0.12 : 1);
                shape.setFillStyle(view.crumble.phase === 'warning' ? 0xe99b72 : 0xa77961);
                label?.setText(missing ? '即将复原' : view.crumble.phase === 'warning' ? '即将崩塌！' : '脆石桥');
            }
        }
    }

    reset(): void {
        this.state.reset();
        for (const view of this.views) {
            view.crumble = { phase: 'stable', elapsed: 0 };
            view.switchActive = null;
            if (view.body !== null) { view.body.enable = true; }
            view.shape.setAlpha(1);
        }
        this.message.setVisible(false);
        this.prompt.setVisible(false);
    }

    destroy(): void {
        this.colliders.forEach(c => c.destroy());
        for (const v of this.views) { v.shape.destroy(); v.label?.destroy(); }
        this.views = [];
        this.prompt.destroy();
        this.message.destroy();
    }
}
