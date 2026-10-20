import { BootScene } from './scenes/BootScene';
import { PreloaderScene } from './scenes/PreloaderScene';
import { MenuScene } from './scenes/MenuScene';
import { LevelScene } from './scenes/LevelScene';
import { CampScene } from './scenes/CampScene';
import { AUTO, Game, Scale } from 'phaser';

// GameConfig：1024×768 逻辑分辨率（SRS 2.2 基线）+ Scale.FIT 等比缩放（NFR-06 / EX-06）
// Arcade Physics 重力 1300（SRS 附录 A，与 MotionModel 同源）
const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    width: 1024,
    height: 768,
    parent: 'game-container',
    backgroundColor: '#1a1c2c',
    scale: {
        mode: Scale.FIT,
        autoCenter: Scale.CENTER_BOTH
    },
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { x: 0, y: 1300 },
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
