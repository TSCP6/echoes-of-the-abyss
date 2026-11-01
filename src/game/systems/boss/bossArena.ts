import { Geom, type GameObjects, type Physics, type Scene } from 'phaser';

interface SavedBounds {
    body: Physics.Arcade.Body;
    bounds: Geom.Rectangle;
    collide: boolean;
}

/** 地图范围同时决定可见封锁和真实左右碰撞，重试/击败时恢复角色原设置。 */
export class BossArena {
    private graphics: GameObjects.Graphics;
    private bounds: Geom.Rectangle;
    private saved = new Map<Physics.Arcade.Body, SavedBounds>();
    private active = false;

    constructor(scene: Scene, readonly rect: Geom.Rectangle, mapHeight: number) {
        this.graphics = scene.add.graphics().setDepth(15).setVisible(false);
        // 纵向留出地图及掉落救援空间，只封锁左右。
        this.bounds = new Geom.Rectangle(rect.x, -mapHeight, rect.width, mapHeight * 3 + 1024);
    }

    get isActive(): boolean { return this.active; }

    activate(bodies: Physics.Arcade.Body[]): void {
        if (!this.active) {
            this.active = true;
            const g = this.graphics;
            g.clear().setVisible(true);
            for (const x of [this.rect.left, this.rect.right]) {
                g.fillStyle(0xffd470, 0.18).fillRect(x - 8, this.rect.y, 16, this.rect.height);
                g.lineStyle(3, 0xffd470, 0.95).lineBetween(x, this.rect.top, x, this.rect.bottom);
                for (let y = this.rect.y + 16; y < this.rect.bottom; y += 32) {
                    g.lineBetween(x - 6, y, x + 6, y + 12);
                }
            }
        }
        this.enforce(bodies);
    }

    enforce(bodies: Physics.Arcade.Body[]): void {
        if (!this.active) { return; }
        for (const body of bodies) {
            if (!body.enable || this.saved.has(body)) { continue; }
            this.saved.set(body, { body, bounds: body.customBoundsRectangle, collide: body.collideWorldBounds });
            body.setBoundsRectangle(this.bounds);
            body.setCollideWorldBounds(true);
        }
    }

    release(): void {
        for (const { body, bounds, collide } of this.saved.values()) {
            if (body.world === null || body.world === undefined) { continue; }
            body.setBoundsRectangle(bounds);
            body.setCollideWorldBounds(collide);
        }
        this.saved.clear();
        this.active = false;
        this.graphics.setVisible(false);
    }

    destroy(): void {
        this.release();
        this.graphics.destroy();
    }
}
