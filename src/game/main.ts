import { BootScene } from './scenes/BootScene';
import { PreloaderScene } from './scenes/PreloaderScene';
import { MenuScene } from './scenes/MenuScene';
import { LevelScene } from './scenes/LevelScene';
import { CampScene } from './scenes/CampScene';
import { AUTO, Game, Scale } from 'phaser';
import { PLAYER_DEFAULTS } from './data/playerDefaults';
import { DESIGN_WIDTH, DESIGN_HEIGHT } from './systems/viewportLayout';

// 以 1024×768 为最小逻辑视野，等比缩放并扩展视口以铺满浏览器（EX-06）。
const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
    parent: 'game-container',
    backgroundColor: '#1a1c2c',
    disableContextMenu: true, // 右键用于副手攻击，不弹出浏览器菜单。
    scale: {
        mode: Scale.EXPAND,
        autoCenter: Scale.CENTER_BOTH
    },
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { x: 0, y: PLAYER_DEFAULTS.gravity }, // 单一数值源（DR-01），消除双写
            debug: false
        }
    },
    scene: [
        BootScene,
        PreloaderScene,
        MenuScene,
        LevelScene,
        CampScene
    ]
};

const StartGame = (parent: string) => {
    return new Game({ ...config, parent });
};

export default StartGame;
