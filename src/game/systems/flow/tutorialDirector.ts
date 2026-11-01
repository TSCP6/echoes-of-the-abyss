/**
 * MOD-09 TutorialDirector（Phaser 呈现层）—— FR-17 全部规则。
 * 仅 1-1 激活；5 个触发区（move/jump/attack/pickup/interact）读地图 `hints` 对象组（DD-05）。
 * 顺序模型（规则 1"按顺序"）：进入触发区入队；队首为 current 才显示；
 * 完成判定 = 对应动作钩子到达（6.2.3 场景内直调）：
 *   move    → InputGateway moveLeft/moveRight 按下（update 内直读）
 *   jump    → PlayerController.onJumped（跳跃实际发生）
 *   attack  → CombatResolver.onAttackBegan（挥击/射击发起）
 *   pickup  → PickupSystem.onCoinPicked（金币入袋）
 *   interact→ PickupSystem.onChestOpened（宝箱开启）
 * 完成 → tutorial:hint {done:true}（TutorialHints 0.5 s 淡出）并推进队首；
 * 单条 8 s 超时（规则 3）→ 消费不重复出现（firedHints 在 PickupSystem 侧 + 本侧 consumed）；
 * 5/5 消费 → markTutorialDone 入存档（规则 4）。
 * 已完成教学（tutorialDone）→ 整关不显示（FR-17 边界，TutorialHints 侧双保险）。
 */
import { emitEvent } from '../../events';
import { progressService } from '../../domain/progression/progressService';
import type { InputGateway } from '../player/inputGateway';
import type { PlayerController } from '../player/playerController';
import type { CombatResolver } from '../combat/combatResolver';
import type { PickupSystem } from '../world/pickupSystem';

type HintAction = 'move' | 'jump' | 'attack' | 'pickup' | 'interact';
const HINT_TIMEOUT_SEC = 8; // FR-17 规则 3

export class TutorialDirector {
    private queue: HintAction[] = [];
    private current: HintAction | null = null;
    private currentT = 0;
    private consumed = new Set<HintAction>();
    private active = false;

    constructor(
        levelId: string,
        private gateway: InputGateway,
        player: PlayerController,
        combat: CombatResolver,
        pickups: PickupSystem
    ) {
        this.active = levelId === '1-1' && !progressService.isTutorialDone();
        if (!this.active) { return; }
        // 链式保留既有钩子（音效等先注册者），避免覆盖（6.2.3 多消费者）
        const prevJump = player.onJumped;
        player.onJumped = () => { prevJump?.(); this.complete('jump'); };
        const prevAttack = combat.onAttackBegan;
        combat.onAttackBegan = (type) => { prevAttack?.(type); this.complete('attack'); };
        const prevCoin = pickups.onCoinPicked;
        pickups.onCoinPicked = (amount) => { prevCoin?.(amount); this.complete('pickup'); };
        const prevChest = pickups.onChestOpened;
        pickups.onChestOpened = () => { prevChest?.(); this.complete('interact'); };
    }

    get isActive(): boolean { return this.active; }

    /** PickupSystem.onHint 转发：进入触发区入队（规则 1/2）；text 由 LevelScene 提供 */
    onHintEnter(id: string, action: string, text: string): void {
        if (!this.active) { return; }
        const a = action as HintAction;
        if (this.consumed.has(a) || this.queue.includes(a) || this.current === a) { return; }
        this.queue.push(a);
        this.texts.set(a, { id, text });
        this.promote();
    }

    /** 管线阶段 2 后：move 完成判定 + 8 s 超时推进 */
    update(dt: number): void {
        if (!this.active) { return; }
        if (this.current === 'move' && (this.gateway.isDown('moveLeft') || this.gateway.isDown('moveRight'))) {
            this.complete('move');
            return;
        }
        if (this.current !== null) {
            this.currentT += dt;
            if (this.currentT >= HINT_TIMEOUT_SEC) {
                emitEvent('tutorial:hint', { hintId: this.current, done: true });
                this.consume(); // 规则 3：超时消费不重复
            }
        }
    }

    private promote(): void {
        if (this.current !== null) { return; }
        const next = this.queue.shift();
        if (next === undefined) { return; }
        this.current = next;
        this.currentT = 0;
        const t = this.texts.get(next);
        if (t !== undefined) { emitEvent('tutorial:hint', { hintId: t.id, text: t.text }); }
    }

    private complete(action: HintAction): void {
        if (!this.active || this.current !== action) { return; }
        emitEvent('tutorial:hint', { hintId: action, done: true }); // TutorialHints 0.5 s 淡出
        this.consume();
    }

    private consume(): void {
        if (this.current === null) { return; }
        this.consumed.add(this.current);
        this.current = null;
        this.currentT = 0;
        if (this.consumed.size >= 5) {
            progressService.markTutorialDone(); // 规则 4：状态入存档（progress 参与者快照）
        }
        this.promote();
    }

    private texts = new Map<HintAction, { id: string; text: string }>();
}
