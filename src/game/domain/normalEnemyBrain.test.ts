import { describe, expect, it } from 'vitest';
import { NORMAL_ENEMY_COMBAT } from '../data/normalEnemyCombat';
import { ENEMIES } from '../data/enemies';
import { NormalEnemyBrain, type NormalEnemyInput } from './normalEnemyBrain';

function brain(id = 'enm_flyer') {
    const def = structuredClone(ENEMIES.find(e => e.id === id)!);
    const model = new NormalEnemyBrain(def, structuredClone(NORMAL_ENEMY_COMBAT[id]), { x: 0, y: 0 });
    const input: NormalEnemyInput = { x: 0, y: 0, player: { x: 100, y: 110 },
        canMoveLeft: true, canMoveRight: true, blocked: false, visible: true, playerAlive: true };
    const tick = (seconds: number) => { let motion; for (let t = 0; t < seconds - 0.001; t += 0.05) { motion = model.tick(0.05, input); } return motion!; };
    return { model, input, tick };
}

describe('普通敌人领域状态机边界', () => {
    it('范围外持续巡逻，不会在未发现玩家时自行归位停摆', () => {
        const f = brain('enm_patrol'); f.input.player.x = 2000;
        f.tick(4);
        expect(f.model.snapshot.stage).toBe('patrol');
        expect(f.tick(0.05).vx).not.toBe(0);
    });
    it('紫鹰前摇早期修正目标，末段锁定后不再追踪玩家转弯', () => {
        const f = brain(); f.tick(0.05); f.tick(0.2);
        f.input.player.x = 130; f.tick(0.1);
        expect(f.model.snapshot.target.x).toBe(130);
        f.tick(0.2); expect(f.model.snapshot.locked).toBe(true);
        f.input.player.x = -100; f.tick(0.05);
        expect(f.model.snapshot.target.x).toBe(130);
        const motion = f.tick(0.2);
        expect(f.model.snapshot.stage).toBe('active');
        expect(motion.vx).toBeGreaterThan(0);
    });
    it.each(['撞墙', '超过距离', '越过目标'])('俯冲%s时立即停止并进入完整后摇', reason => {
        const f = brain(); f.tick(0.75);
        expect(f.model.snapshot.stage).toBe('active');
        if (reason === '撞墙') { f.input.blocked = true; }
        else if (reason === '超过距离') { f.input.x = -270; }
        else { f.input.x = 120; f.input.y = 130; }
        const motion = f.tick(0.05);
        expect(f.model.snapshot.stage).toBe('recovery');
        expect(motion).toMatchObject({ vx: 0, vy: 0, fire: false });
        expect(f.model.snapshot.attack).toBeNull();
        f.tick(0.9); expect(f.model.snapshot.stage).toBe('recovery');
    });
    it('飞行离开出生点活动半径后持续归巢，不被身旁玩家重新拉走', () => {
        const f = brain(); f.input.x = 510; f.input.player = { x: 530, y: 0 };
        expect(f.tick(0.05).vx).toBeLessThan(0);
        f.input.x = 250; f.input.player.x = 270;
        expect(f.tick(0.05).vx).toBeLessThan(0);
        expect(f.model.snapshot.stage).toBe('return');
    });
    it('远程退让有距离预算，被追上后会停步攻击', () => {
        const f = brain('enm_patrol'); f.input.player = { x: 50, y: 0 };
        for (let i = 0; i < 30; i++) {
            const motion = f.model.tick(0.05, f.input);
            f.input.x += motion.vx * 0.05; f.input.player.x = f.input.x + 50;
        }
        expect(f.input.x).toBeGreaterThanOrEqual(-75);
        expect(['windup', 'active', 'recovery']).toContain(f.model.snapshot.stage);
    });
    it('前摇受击后取消攻击，不会补发弹丸或残留攻击盒', () => {
        for (const id of ['enm_chaser', 'enm_patrol', 'enm_flyer']) {
            const f = brain(id); if (id === 'enm_chaser') { f.input.player = { x: 50, y: 0 }; }
            if (id === 'enm_patrol') { f.input.player = { x: 200, y: 0 }; }
            f.tick(0.05); expect(f.model.snapshot.stage).toBe('windup');
            f.model.interrupt(); expect(f.model.snapshot.attack).toBeNull();
            expect(f.tick(0.2).fire).toBe(false);
            expect(f.model.snapshot.stage).toBe('recovery');
        }
    });
    it('玩家死亡时取消前摇，停止追击与发射', () => {
        const f = brain('enm_patrol'); f.input.player = { x: 200, y: 0 };
        f.tick(0.05); f.input.playerAlive = false;
        expect(f.tick(0.8).fire).toBe(false);
        expect(f.model.snapshot.attack).toBeNull();
        expect(f.model.snapshot.stage).not.toBe('windup');
    });
    it('遮挡后不隔墙瞄准，追踪丢失后返回出生区域', () => {
        const f = brain('enm_patrol'); f.input.x = 100; f.input.player = { x: 400, y: 0 };
        f.tick(0.05); f.input.visible = false;
        f.tick(2.6); expect(f.model.snapshot.stage).toBe('return');
        expect(f.tick(0.05).vx).toBeLessThan(0);
    });
    it('同次近战只能消费一次攻击，后续物理位置用于更新攻击盒', () => {
        const f = brain('enm_chaser'); f.input.player = { x: 50, y: 0 };
        f.tick(0.4); expect(f.model.snapshot.attack).not.toBeNull();
        f.model.syncPosition({ x: 20, y: 0 });
        expect(f.model.snapshot.attack!.rect.x).toBe(34);
        f.model.consumeAttack(); expect(f.model.snapshot.attack).toBeNull();
    });
});

describe('丢失目标后的短期记忆', () => {
    it('短暂遮挡不会立即反向巡逻，也不会追踪不可见玩家的新位置', () => {
        const f = brain('enm_chaser');
        f.input.x = 150; f.input.player = { x: 340, y: 0 };
        expect(f.tick(0.05).vx).toBe(160);
        f.input.visible = false; f.input.player.x = -200;
        const motion = f.tick(0.05);
        expect(f.model.snapshot.stage).toBe('chase');
        expect(motion.vx).toBe(160);
        f.tick(2.5);
        expect(f.model.snapshot.stage).toBe('return');
        expect(f.tick(0.05).vx).toBeLessThan(0);
    });
});
