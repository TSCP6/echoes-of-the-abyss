import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Game, Scene } from 'phaser';
import { SceneDirector } from '../../../../src/game/systems/flow/sceneDirector';

type Status = 'active' | 'paused' | 'shutdown' | 'sleeping';

function fixture(initial: Record<string, Status>, gameplay?: string) {
    const director = new SceneDirector();
    const effects: string[] = [];
    const starts: { target: string; data?: Record<string, unknown> }[] = [];
    const operations: (() => void)[] = [];
    const scenes = new Map<string, ReturnType<typeof makeScene>>();
    const registered = new Set<string>();
    let autoStart = true;

    function makeScene(key: string, status: Status) {
        const state = { status };
        const input = { enabled: true };
        return {
            state, input,
            cameras: { main: { fadeOut(duration: number, r: number, g: number, b: number) {
                effects.push(`fade:${key}:${duration}:${r},${g},${b}`);
            } } },
            scene: {
                key,
                isActive: () => state.status === 'active',
                isPaused: () => state.status === 'paused',
                resume() {
                    effects.push(`resume:${key}:input=${input.enabled}`);
                    state.status = 'active';
                },
                start(target: string, data?: Record<string, unknown>) {
                    starts.push({ target, data });
                    // ScenePlugin.start 在下次 manager update 依次 stop/start；即使源已 shutdown 仍可排队。
                    operations.push(() => {
                        effects.push(`stop:${key}`);
                        state.status = 'shutdown';
                        if (autoStart) {
                            effects.push(`start:${target}`);
                            const next = scenes.get(target)!;
                            next.state.status = 'active';
                            next.input.enabled = true;
                            if (target === 'Level' || target === 'Camp') {
                                director.setActiveGameplay(next as unknown as Scene);
                            }
                        }
                    });
                }
            }
        };
    }

    for (const [key, status] of Object.entries(initial)) {
        scenes.set(key, makeScene(key, status));
        registered.add(key);
    }
    for (const key of ['Menu', 'Level', 'Camp']) {
        if (!scenes.has(key)) {
            scenes.set(key, makeScene(key, 'shutdown'));
            registered.add(key);
        }
    }
    director.attachGame({ scene: {
        getScenes: (active = true) => [...scenes.values()].filter((s) =>
            registered.has(s.scene.key) && (!active || s.scene.isActive()))
    } } as unknown as Game);
    const scene = (key: string) => scenes.get(key)!;
    if (gameplay !== undefined) { director.setActiveGameplay(scene(gameplay) as unknown as Scene); }

    function update() {
        operations.splice(0).forEach((operation) => operation());
        vi.advanceTimersByTime(16);
    }
    function finishFade() {
        vi.advanceTimersByTime(400);
        update();
    }
    return { director, effects, starts, scene, registered, update, finishFade,
        blockTargetStart() { autoStart = false; } };
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', {
        setTimeout: globalThis.setTimeout,
        requestAnimationFrame: (callback: FrameRequestCallback) =>
            globalThis.setTimeout(() => callback(0), 16)
    });
});

afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('SceneDirector 场景切换', () => {
    it('无 active、只有 paused gameplay 时，恢复淡出并在 400ms 后停旧开菜单', () => {
        const f = fixture({ Boot: 'shutdown', Level: 'paused' }, 'Level');
        f.director.gotoMenu();

        expect(f.director.isTransitioning).toBe(true);
        expect(f.scene('Level').input.enabled).toBe(false);
        expect(f.effects).toEqual(['resume:Level:input=false', 'fade:Level:400:0,0,0']);
        vi.advanceTimersByTime(399);
        expect(f.starts).toEqual([]);
        vi.advanceTimersByTime(1);
        expect(f.starts).toEqual([{ target: 'Menu', data: undefined }]);
        f.update();
        expect(f.scene('Level').state.status).toBe('shutdown');
        expect(f.scene('Menu').state.status).toBe('active');
        expect(f.director.isTransitioning).toBe(false);
    });

    it('没有玩法令牌也能从 paused 场景退出（如异常退出）', () => {
        const f = fixture({ Level: 'paused' });
        f.director.gotoMenu();
        f.finishFade();
        expect(f.starts).toEqual([{ target: 'Menu', data: undefined }]);
        expect(f.scene('Level').state.status).toBe('shutdown');
        expect(f.director.isTransitioning).toBe(false);
    });

    it('转菜单清理玩法令牌，即使源 shutdown 未清理也不会继续持有旧场景', () => {
        const f = fixture({ Level: 'active' }, 'Level');
        f.director.gotoMenu();
        f.finishFade();
        expect(f.director.isGameplay(f.scene('Level') as unknown as Scene)).toBe(false);
    });

    it('普通切换保留参数、DOM 延时和目标 active 后收尾', () => {
        const f = fixture({ Menu: 'active' });
        f.director.gotoLevel('1-4');
        expect(f.effects).toEqual(['fade:Menu:400:0,0,0']);
        expect(f.scene('Menu').input.enabled).toBe(false);
        vi.advanceTimersByTime(400);
        expect(f.director.isTransitioning).toBe(true);
        expect(f.starts).toEqual([{ target: 'Level', data: { levelId: '1-4' } }]);
        f.update();
        expect(f.effects.slice(-2)).toEqual(['stop:Menu', 'start:Level']);
        expect(f.director.isGameplay(f.scene('Level') as unknown as Scene)).toBe(true);
        expect(f.director.isTransitioning).toBe(false);
    });

    it('明确续关时把恢复标志传入关卡，默认重玩保持原参数契约', () => {
        const f = fixture({ Menu: 'active' });
        f.director.gotoLevel('1-2', true);
        f.finishFade();
        expect(f.starts).toEqual([{ target: 'Level', data: { levelId: '1-2', resume: true } }]);
    });

    it('连点仅保留最后一个 pending 意图及参数', () => {
        const f = fixture({ Menu: 'active' });
        f.director.gotoLevel('1-1');
        f.director.gotoCamp(1);
        f.director.gotoMenu();
        f.director.gotoCamp(3);
        f.finishFade();
        expect(f.director.isTransitioning).toBe(true);
        f.finishFade();
        expect(f.starts).toEqual([
            { target: 'Level', data: { levelId: '1-1' } },
            { target: 'Camp', data: { sceneId: 3 } }
        ]);
        expect(f.scene('Level').state.status).toBe('shutdown');
        expect(f.scene('Camp').state.status).toBe('active');
        expect(f.director.isGameplay(f.scene('Camp') as unknown as Scene)).toBe(true);
        expect(f.director.isTransitioning).toBe(false);
    });

    it.each(['active', 'paused'] as const)('结算重试（源初始 %s）由 DOM 定时推进，淡出期间 pause/shutdown 也不吞请求', (status) => {
        const f = fixture({ Level: status }, 'Level');
        f.director.gotoLevel('2-4');
        f.scene('Level').state.status = 'paused';
        vi.advanceTimersByTime(200);
        f.scene('Level').state.status = 'shutdown';
        vi.advanceTimersByTime(200);
        f.update();
        expect(f.starts).toEqual([{ target: 'Level', data: { levelId: '2-4' } }]);
        expect(f.scene('Level').state.status).toBe('active');
        expect(f.director.isGameplay(f.scene('Level') as unknown as Scene)).toBe(true);
        expect(f.director.isTransitioning).toBe(false);
    });

    it.each(['shutdown', 'paused'] as const)('当前已有 Menu 时不从旧 %s gameplay 恢复', (status) => {
        const f = fixture({ Level: status, Menu: 'active' }, 'Level');
        f.director.gotoCamp(2);
        f.finishFade();
        expect(f.effects).toEqual(['fade:Menu:400:0,0,0', 'stop:Menu', 'start:Camp']);
        expect(f.scene('Level').state.status).toBe(status);
    });

    it('不恢复已脱离管理器的 paused 令牌实例', () => {
        const f = fixture({ Level: 'paused', Camp: 'paused' }, 'Level');
        f.registered.delete('Level');
        f.director.gotoMenu();
        f.finishFade();
        expect(f.effects).toEqual(['resume:Camp:input=false', 'fade:Camp:400:0,0,0', 'stop:Camp', 'start:Menu']);
        expect(f.scene('Level').state.status).toBe('paused');
        expect(f.director.isGameplay(f.scene('Level') as unknown as Scene)).toBe(false);
    });

    it('跳过 shutdown/sleeping 场景；多个 paused 时选择持令牌的当前玩法', () => {
        const f = fixture({ Boot: 'shutdown', Old: 'sleeping', Camp: 'paused', Level: 'paused' }, 'Level');
        f.director.gotoMenu();
        f.finishFade();
        expect(f.effects).toEqual(['resume:Level:input=false', 'fade:Level:400:0,0,0', 'stop:Level', 'start:Menu']);
        expect(f.scene('Camp').state.status).toBe('paused');
    });

    it('无可用源场景时等待启动，不恢复 shutdown 令牌', () => {
        const f = fixture({ Level: 'shutdown' }, 'Level');
        f.director.gotoMenu();
        vi.advanceTimersByTime(32);
        expect(f.effects).toEqual([]);
        expect(f.starts).toEqual([]);
        f.scene('Level').state.status = 'active';
        vi.advanceTimersByTime(16);
        f.finishFade();
        expect(f.scene('Menu').state.status).toBe('active');
    });

    it('目标未就绪时保留轮询上限并在超时后消费 pending', () => {
        const f = fixture({ Menu: 'active' });
        f.blockTargetStart();
        f.director.gotoLevel('1-1');
        f.director.gotoCamp(2);
        vi.advanceTimersByTime(400);
        // 不刷新 manager：Menu 仍 active，让超时后的下一次切换有合法源场景。
        vi.advanceTimersByTime(16 * 119);
        expect(f.starts).toHaveLength(1);
        expect(f.director.isTransitioning).toBe(true);
        vi.advanceTimersByTime(16 + 400);
        expect(f.starts).toEqual([
            { target: 'Level', data: { levelId: '1-1' } },
            { target: 'Camp', data: { sceneId: 2 } }
        ]);
        vi.advanceTimersByTime(16 * 120);
        expect(f.director.isTransitioning).toBe(false);
    });
});
