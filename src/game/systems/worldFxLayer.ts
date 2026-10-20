/**
 * MOD-10 WorldFxLayer（Phaser 呈现层）—— 世界内视觉反馈（非 DOM 的一切）：
 * 浮动伤害数字（0.6 s 上浮 24 px 淡出，FR-04 规则 6）、受击闪白 0.08 s（FR-04 输出）、
 * 拾取缩放淡出 0.25 s（FR-16 规则 3）。池 16 文本（DD-13），耗尽丢最老实例（视觉降级不阻塞）。
 */
import { type Scene } from 'phaser';

const FLOAT_POOL = 16;

interface FloatText {
    text: Phaser.GameObjects.Text;
    inUse: boolean;
    bornAt: number;
}

export class WorldFxLayer {
    private pool: FloatText[] = [];
    private clock = 0;

    constructor(private scene: Scene) {
        for (let i = 0; i < FLOAT_POOL; i++) {
            const text = scene.add.text(0, 0, '', { fontSize: '16px', color: '#ffffff' }).setDepth(40).setVisible(false);
            this.pool.push({ text, inUse: false, bornAt: 0 });
        }
    }

    tick(dt: number): void { this.clock += dt; }

    private acquire(): FloatText {
        const free = this.pool.find((p) => !p.inUse);
        if (free !== undefined) { return free; }
        // 池耗尽：丢最老实例（DD-13）
        let oldest = this.pool[0];
        for (const p of this.pool) {
            if (p.bornAt < (oldest?.bornAt ?? Infinity)) { oldest = p; }
        }
        return oldest as FloatText;
    }

    /** 玩家对敌人伤害数字（FR-04 规则 6） */
    damageNumber(x: number, y: number, amount: number): void {
        const slot = this.acquire();
        slot.inUse = true;
        slot.bornAt = this.clock;
        slot.text.setText(String(amount));
        slot.text.setColor('#ffe066');
        slot.text.setPosition(x, y);
        slot.text.setAlpha(1);
        slot.text.setVisible(true);
        this.scene.tweens.add({
            targets: slot.text, y: y - 24, alpha: 0, duration: 600,
            onComplete: () => { slot.text.setVisible(false); slot.inUse = false; }
        });
    }

    /** 受击闪白 0.08 s（FR-04 输出） */
    hitFlash(target: Phaser.GameObjects.Sprite): void {
        target.setTint(0xffffff);
        this.scene.time.delayedCall(80, () => target.clearTint());
    }

    /** 拾取缩放淡出 0.25 s（FR-16 规则 3） */
    pickupPop(sprite: Phaser.GameObjects.Sprite): void {
        this.scene.tweens.add({
            targets: sprite, scale: sprite.scale * 1.4, alpha: 0, duration: 250,
            onComplete: () => sprite.setVisible(false)
        });
    }

    destroy(): void {
        for (const p of this.pool) { p.text.destroy(); }
        this.pool = [];
    }
}
