/** 营地视觉配置。设施坐标与交互区共享，不承载商店或战斗数值。 */
export const CAMP_FACILITIES = {
    merchant: { x: 276, y: 478, width: 244, height: 244, labelY: 602 },
    portal: { x: 758, y: 478, width: 196, height: 244, labelY: 602 }
} as const;

export interface CampPalette {
    shadow: number;
    ground: number;
    soil: number;
    edge: number;
    stone: number;
    stoneLight: number;
    foliage: number;
    foliageLight: number;
    wood: number;
    cloth: number;
    clothLight: number;
    accent: number;
    portal: number;
}

const CAMP_PALETTES: Record<1 | 2 | 3, CampPalette> = {
    1: {
        shadow: 0x142a27, ground: 0x3c543b, soil: 0x293b31, edge: 0x789653,
        stone: 0x5e6c5f, stoneLight: 0x9da487, foliage: 0x285e43, foliageLight: 0x52834d,
        wood: 0x795038, cloth: 0x925b42, clothLight: 0xc39565, accent: 0xefd59a, portal: 0x83dba6
    },
    2: {
        shadow: 0x181d34, ground: 0x3b3d58, soil: 0x272c43, edge: 0x687289,
        stone: 0x545b75, stoneLight: 0x919ab4, foliage: 0x326f87, foliageLight: 0x86cecf,
        wood: 0x65516a, cloth: 0x505e91, clothLight: 0x8b91bc, accent: 0xabe5df, portal: 0x82dce7
    },
    3: {
        shadow: 0x344565, ground: 0x9399a6, soil: 0x535f77, edge: 0xd8cfb4,
        stone: 0xa6a9b4, stoneLight: 0xe0ddcc, foliage: 0x4e8192, foliageLight: 0x9ecbc4,
        wood: 0x816953, cloth: 0x496d86, clothLight: 0x97b6bc, accent: 0xffdfa3, portal: 0xf2db97
    }
};

export function getCampPalette(regionId: 1 | 2 | 3): CampPalette { return CAMP_PALETTES[regionId]; }
