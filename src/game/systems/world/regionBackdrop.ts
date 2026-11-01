import { Scale, Scenes, type GameObjects, type Scene } from 'phaser';
import { getRegionTheme, normalizeRegionVariant, type RegionId } from '../../data/regionThemes';

const LAYERS = ['far', 'mid', 'near'] as const;
const PARALLAX = [0.08, 0.19, 0.32] as const;
const TEMPLE_ALPHA = [0.64, 0.7, 0.8] as const;

/** 在 PreloaderScene.load.setPath('assets') 之后调用；所有文件随游戏本地发布。 */
export function registerRegionArt(scene: Scene): void {
    for (const id of [1, 2, 3] as const) {
        const { assetPrefix, tileTextureKey } = getRegionTheme(id);
        scene.load.image(tileTextureKey, `art/regions/${assetPrefix}_tiles.png`);
        for (let variant = 0; variant < 4; variant++) {
            scene.load.image(`region_${assetPrefix}_sky_${variant}`, `art/regions/${assetPrefix}_sky_${variant}.png`);
        }
        for (const layer of [...LAYERS, 'motes']) {
            scene.load.image(`region_${assetPrefix}_${layer}`, `art/regions/${assetPrefix}_${layer}.png`);
        }
    }
}

export interface RegionBackdrop {
    /** 可提前释放；场景 shutdown 时也会自动释放，重复调用安全。 */
    destroy(): void;
}

/**
 * 四层区域背景：天空、远地标、中景建筑/植物、边缘框景，加一层稀疏尘光。
 * 图层固定在视口，通过纹理偏移产生水平和有限的垂直视差；不创建物理对象。
 * 每帧抵消 Boss 镜头缩放，扩展视口和大幅高低差不会露出背景边缘。
 */
export function createRegionBackdrop(scene: Scene, regionId: RegionId, variant = 0): RegionBackdrop {
    const theme = getRegionTheme(regionId);
    const chosen = normalizeRegionVariant(variant);
    const prefix = `region_${theme.assetPrefix}`;
    const sky = scene.add.image(0, 0, `${prefix}_sky_${chosen}`)
        .setOrigin(0).setScrollFactor(0).setDepth(-60).setName('region-background-sky');
    const layers = LAYERS.map((layer, index) => {
        return scene.add.tileSprite(0, 0, 1, 1, `${prefix}_${layer}`)
            .setOrigin(0).setScrollFactor(0).setDepth(-55 + index * 10)
            .setTint(theme.layerTints[chosen] ?? 0xffffff)
            .setAlpha(regionId === 3 ? TEMPLE_ALPHA[index]! : 1)
            .setName(`region-background-${layer}`);
    });
    const motes = scene.add.tileSprite(0, 0, 1, 1, `${prefix}_motes`)
        .setOrigin(0).setScrollFactor(0).setDepth(-24).setAlpha(regionId === 2 ? 0.48 : 0.32)
        .setName('region-background-motes');
    let width = 1;
    let height = 1;
    let textureScale = 1;
    let disposed = false;

    const layout = (): void => {
        ({ width, height } = scene.scale.gameSize);
        // 额外 160px 垂直余量支持深渊下潜和上升路线，避免天空/地形重复平铺。
        textureScale = Math.max(1, (height + 160) / 1024);
        for (const layer of layers) {
            layer.setSize(width, height).setTileScale(textureScale);
        }
        motes.setSize(width, height);
    };

    const fixedToViewport = (object: GameObjects.Image | GameObjects.TileSprite): void => {
        const cam = scene.cameras.main;
        const inverseZoom = 1 / cam.zoom;
        object.setScale(inverseZoom).setPosition(cam.width * (1 - inverseZoom) / 2, cam.height * (1 - inverseZoom) / 2);
    };

    const update = (): void => {
        if (disposed) { return; }
        const cam = scene.cameras.main;
        // Image 使用源尺寸比例覆盖；TileSprite 保持视口宽高、只偏移纹理。
        const inverseZoom = 1 / cam.zoom;
        sky.setDisplaySize(width * inverseZoom, height * inverseZoom)
            .setPosition(cam.width * (1 - inverseZoom) / 2, cam.height * (1 - inverseZoom) / 2);
        // Phaser 4 的 tilePosition 按源纹理像素计量，余量不能使用屏幕像素。
        const verticalRoom = Math.max(0, 1024 - height / textureScale);
        layers.forEach((layer, index) => {
            fixedToViewport(layer);
            layer.tilePositionX = cam.scrollX * PARALLAX[index]!;
            // 垂直偏移有界，地图再高也不会把底部岩层卷成第二个天空。
            layer.tilePositionY = Math.max(0, Math.min(verticalRoom, verticalRoom * 0.28 + cam.scrollY * (0.025 + index * 0.015)));
        });
        fixedToViewport(motes);
        const elapsed = scene.time.now;
        motes.tilePositionX = cam.scrollX * 0.24 + elapsed * (regionId === 3 ? 0.007 : 0.003);
        motes.tilePositionY = cam.scrollY * 0.06 - elapsed * 0.002;
    };

    const destroy = (): void => {
        if (disposed) { return; }
        disposed = true;
        scene.scale.off(Scale.Events.RESIZE, layout);
        scene.events.off(Scenes.Events.POST_UPDATE, update);
        scene.events.off(Scenes.Events.SHUTDOWN, destroy);
        sky.destroy();
        layers.forEach((layer) => layer.destroy());
        motes.destroy();
    };

    layout();
    update();
    scene.scale.on(Scale.Events.RESIZE, layout);
    scene.events.on(Scenes.Events.POST_UPDATE, update);
    scene.events.once(Scenes.Events.SHUTDOWN, destroy);
    return { destroy };
}
