/** 三大区域的呈现配置。仅包含本地资源和色彩，不参与碰撞、伤害或运动数值。 */
export type RegionId = 1 | 2 | 3;

export interface RegionTheme {
    readonly id: RegionId;
    readonly name: string;
    readonly assetPrefix: 'forest' | 'cavern' | 'temple';
    readonly tileTextureKey: string;
    readonly backgroundColor: string;
    readonly accentColor: number;
    readonly variants: readonly [string, string, string, string];
    readonly layerTints: readonly [number, number, number, number];
}

const REGION_THEMES: Readonly<Record<RegionId, RegionTheme>> = {
    1: {
        id: 1, name: '森林遗迹', assetPrefix: 'forest', tileTextureKey: 'region_forest_tiles',
        backgroundColor: '#153c45', accentColor: 0xb7d78d,
        variants: ['晨光林道', '暮色古林', '月雾遗迹', '蚀月守望'],
        layerTints: [0xffffff, 0xb9c4e7, 0xa1d2cc, 0x9abeb2]
    },
    2: {
        id: 2, name: '地下水晶洞', assetPrefix: 'cavern', tileTextureKey: 'region_cavern_tiles',
        backgroundColor: '#0d142b', accentColor: 0x94d8d6,
        variants: ['蓝晶裂隙', '紫晶回廊', '碧光深渊', '蛛巢晶心'],
        layerTints: [0xffffff, 0xd3bbff, 0x94e1d4, 0xecb3d8]
    },
    3: {
        id: 3, name: '天空神殿', assetPrefix: 'temple', tileTextureKey: 'region_temple_tiles',
        backgroundColor: '#29395e', accentColor: 0xecd8a8,
        variants: ['云海天阶', '落日长廊', '星环穹顶', '终焉圣坛'],
        layerTints: [0xffffff, 0xf0c4cc, 0xb3ceff, 0xd5b9ec]
    }
};

export function getRegionTheme(regionId: RegionId): RegionTheme {
    return REGION_THEMES[regionId];
}

/** 关卡序号可直接传入；负数、非整数和循环调用均得到稳定的 0~3 变体。 */
export function normalizeRegionVariant(variant = 0): number {
    return Number.isFinite(variant) ? ((Math.trunc(variant) % 4) + 4) % 4 : 0;
}
