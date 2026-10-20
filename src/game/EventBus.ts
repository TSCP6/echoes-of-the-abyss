/**
 * EventBus（通信层，DR-04 载体）。
 * 模板原实现为 Phaser.Events.EventEmitter；因 ARCH-7（领域层禁止 import phaser）而领域层
 * 须经此发通知，改为行为等价的最小发射器：on/off/once/emit，多监听、按注册序回调。
 * 事件名与载荷契约不变（IF-E01~E12 / DR-04）；载荷类型由调用侧泛型强制
 * （领域层经 events.ts 的 EventPayloads 映射；Phaser 场景侧直接传 Scene 实例）。
 */
type AnyHandler = (payload: never) => void; // 存储型：(p:T)=>void 可安全赋入（never 可赋给任意 T）

class MiniEmitter {
    private handlers = new Map<string, AnyHandler[]>();

    on<T>(event: string, handler: (payload: T) => void): this {
        const list = this.handlers.get(event);
        if (list === undefined) { this.handlers.set(event, [handler]); } else { list.push(handler); }
        return this;
    }

    once<T>(event: string, handler: (payload: T) => void): this {
        const wrapped = (p: T): void => {
            this.off(event, wrapped);
            handler(p);
        };
        return this.on(event, wrapped);
    }

    off<T>(event: string, handler: (payload: T) => void): this {
        const list = this.handlers.get(event);
        if (list === undefined) { return this; }
        const idx = list.indexOf(handler);
        if (idx >= 0) { list.splice(idx, 1); }
        return this;
    }

    emit<T>(event: string, payload?: T): boolean {
        const list = this.handlers.get(event);
        if (list === undefined || list.length === 0) { return false; }
        for (const handler of [...list]) { handler(payload as never); }
        return true;
    }

    listenerCount(event: string): number {
        return this.handlers.get(event)?.length ?? 0;
    }

    removeAllListeners(event?: string): this {
        if (event === undefined) { this.handlers.clear(); } else { this.handlers.delete(event); }
        return this;
    }
}

// Used to emit events between components, HTML and Phaser scenes
export const EventBus = new MiniEmitter();
