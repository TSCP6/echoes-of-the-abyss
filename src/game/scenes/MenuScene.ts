/**
 * MenuScene（ARCH-17：模板 MainMenu/GameOver 移除，菜单/结算由 Vue 承担）。
 * 菜单态 Phaser 画布仅显示背景层（DEC-1/DEC-10）；UI 全部在 Vue UiLayer。
 */
import { Scene } from 'phaser';
import { EventBus } from '../EventBus';
import { centerDesignCamera, createViewportBackground } from '../systems/viewportLayout';

export class MenuScene extends Scene {
    constructor() { super('Menu'); }

    create(): void {
        this.cameras.main.fadeIn(400, 0, 0, 0);
        centerDesignCamera(this);
        createViewportBackground(this);
        EventBus.emit('current-scene-ready', this);
    }
}
