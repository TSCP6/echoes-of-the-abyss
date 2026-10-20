/**
 * CampScene（ARCH-17 新增）—— 3 个营地（FR-10）：商人 NPC 交互（E）打开 Vue ShopPanel、
 * 传送门（点击）去关卡选择。营地无敌人无战斗；离开营地为存档写入点（FR-13 规则 2，
 * 由 UiLayer 在切场景前触发 saveSystem.queueWrite）。
 * sceneId 经 scene.start('Camp', { sceneId }) 传入。
 */
import { Scene } from 'phaser';
import { EventBus } from '../EventBus';
import { sceneDirector } from '../systems/sceneDirector';
import { InputGateway } from '../systems/inputGateway';
import { emitEvent, onEvent, offEvent } from '../events';

export class CampScene extends Scene {
    private sceneId: 1 | 2 | 3 = 1;
    private gateway!: InputGateway;
    private overlayOpen = false;
    private onOverlay = (p: { name: string; open: boolean }): void => {
        if (!sceneDirector.isGameplay(this)) { return; }
        this.overlayOpen = p.open;
        if (p.open) { this.scene.pause(); } else { this.scene.resume(); }
    };

    constructor() { super('Camp'); }

    init(data: { sceneId?: number }): void {
        const sid = data.sceneId ?? 1;
        this.sceneId = sid === 2 ? 2 : sid === 3 ? 3 : 1;
    }

    create(): void {
        const bg = this.add.tileSprite(512, 384, 1024, 768, 'bg_green');
        bg.setScrollFactor(0);
        bg.setDepth(-20);
        this.add.rectangle(512, 700, 1024, 140, 0x3a5a3a).setDepth(-10); // 营地地面

        // 商人 NPC（占位纹理）+ 交互提示（E 键，FR-10 输入）
        const merchant = this.add.sprite(420, 640, 'enemy_patrol').setDepth(5);
        merchant.setTint(0x66aaff);
        this.add.text(420, 560, '商人（E 交易）', { fontSize: '16px', color: '#f4f4f4' }).setOrigin(0.5).setDepth(6);

        // 传送门（点击去关卡选择，FR-15 导航）
        const portal = this.add.sprite(640, 640, 'goal_idle', 0).setScale(0.5).setDepth(5).setInteractive();
        portal.on('pointerdown', () => {
            emitEvent('game:requestLevelSelect', { from: 'camp' });
        });
        this.add.text(640, 560, '传送门（点击前往关卡选择）', { fontSize: '16px', color: '#f4f4f4' }).setOrigin(0.5).setDepth(6);

        this.add.text(512, 120, `营地 · 场景 ${this.sceneId}`, {
            fontSize: '32px', color: '#f4f4f4', stroke: '#1a1c2c', strokeThickness: 6
        }).setOrigin(0.5).setDepth(6);

        this.gateway = new InputGateway(this);
        onEvent('ui:overlay', this.onOverlay);
        sceneDirector.setActiveGameplay(this);
        this.cameras.main.fadeIn(400, 0, 0, 0);
        EventBus.emit('current-scene-ready', this);
    }

    update(): void {
        if (this.overlayOpen) { return; }
        this.gateway.poll();
        if (this.gateway.justPressed('interact')) {
            emitEvent('game:requestShop', { sceneId: this.sceneId });
        }
    }

    shutdown(): void {
        offEvent('ui:overlay', this.onOverlay);
        sceneDirector.setActiveGameplay(null);
    }
}
