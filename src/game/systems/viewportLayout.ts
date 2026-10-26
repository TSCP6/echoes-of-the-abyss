import { Scale, Scenes, type Scene } from 'phaser';

export const DESIGN_WIDTH = 1024;
export const DESIGN_HEIGHT = 768;

/** 使用扩展后的逻辑视口布局；场景关闭后移除全局尺寸监听。 */
export function bindViewportLayout(scene: Scene, layout: (width: number, height: number) => void): void {
    const resize = (): void => {
        const { width, height } = scene.scale.gameSize;
        layout(width, height);
    };
    resize();
    scene.scale.on(Scale.Events.RESIZE, resize);
    scene.events.once(Scenes.Events.SHUTDOWN, () => {
        scene.scale.off(Scale.Events.RESIZE, resize);
    });
}

/** 菜单、加载页与营地保留设计坐标，随视口扩展居中。 */
export function centerDesignCamera(scene: Scene): void {
    bindViewportLayout(scene, () => {
        scene.cameras.main.centerOn(DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2);
    });
}

/** 背景始终覆盖屏幕，纹理等比缩放且仅沿水平方向平铺。 */
export function createViewportBackground(scene: Scene, parallax = 0): void {
    const bg = scene.add.tileSprite(0, 0, 1, 1, 'bg_green')
        .setOrigin(0).setScrollFactor(0).setDepth(-20).setName('viewport-background');
    const textureHeight = scene.textures.get('bg_green').getSourceImage().height;
    bindViewportLayout(scene, (width, height) => {
        bg.setSize(width, height);
        bg.setTileScale(Math.max(1, height / textureHeight));
    });
    if (parallax > 0) {
        const scroll = (): void => {
            bg.tilePositionX = scene.cameras.main.scrollX * parallax;
        };
        scene.events.on(Scenes.Events.POST_UPDATE, scroll);
        scene.events.once(Scenes.Events.SHUTDOWN, () => {
            scene.events.off(Scenes.Events.POST_UPDATE, scroll);
        });
    }
}
