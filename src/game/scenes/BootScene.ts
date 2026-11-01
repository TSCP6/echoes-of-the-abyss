/**
 * BootScene（ARCH-17，复用模板 Boot）：仅注册全局配置与适配层单例，立即转 Preloader。
 * 不加载大资源（保持首屏轻，FLOW-R1）。create 时向 SceneDirector 注册 game 实例（唯一注册点）。
 */
import { Scene } from 'phaser';
import { sceneDirector } from '../systems/flow/sceneDirector';
import { appLifecycle } from '../adapters/appLifecycle';

export class BootScene extends Scene {
    constructor() { super('Boot'); }

    preload(): void {
        this.load.image('background', 'assets/bg.png');
    }

    create(): void {
        sceneDirector.attachGame(this.game);
        appLifecycle.install(this.game); // MOD-40：EX-04/05/07 + EXD-4 全局兜底
        this.scene.start('Preloader');
    }
}
