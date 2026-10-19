/**
 * MenuScene（ARCH-17：模板 MainMenu/GameOver 移除，菜单/结算由 Vue 承担）。
 * 菜单态 Phaser 画布仅显示背景层（DEC-1/DEC-10）；UI 全部在 Vue UiLayer。
 */
import { Scene } from 'phaser';
import { EventBus } from '../EventBus';

export class MenuScene extends Scene {
    constructor() { super('Menu'); }

    create(): void {
        this.cameras.main.fadeIn(400, 0, 0, 0);
        const bg = this.add.tileSprite(512, 384, 1024, 768, 'bg_green');
        bg.setScrollFactor(0);
        bg.setDepth(-20);
        this.add.text(512, 300, '深渊回响', {
            fontFamily: 'Arial Black', fontSize: '72px', color: '#f4f4f4',
            stroke: '#1a1c2c', strokeThickness: 10
        }).setOrigin(0.5).setDepth(1);
        this.add.text(512, 380, 'Echoes of the Abyss', {
            fontFamily: 'Arial', fontSize: '24px', color: '#c8c8d8'
        }).setOrigin(0.5).setDepth(1);
        EventBus.emit('current-scene-ready', this);
    }
}
