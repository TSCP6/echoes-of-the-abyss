/**
 * EX-09 配套：节流警告。同一 key 1 分钟内只记录一次，避免刷屏（SRS EX-09 系统行为）。
 * 领域层仅使用 console.warn（Node 可测，不触碰浏览器专有 API）。
 */
const lastWarnAt = new Map<string, number>();
const THROTTLE_MS = 60_000;

export function warnThrottled(key: string, message: string, now: number = Date.now()): void {
    const last = lastWarnAt.get(key);
    if (last !== undefined && now - last < THROTTLE_MS) {
        return;
    }
    lastWarnAt.set(key, now);
    console.warn(`[EX-09] ${key}: ${message}`);
}

/** 仅供单元测试：清空节流记录，保证用例间隔离。 */
export function resetWarnThrottle(): void {
    lastWarnAt.clear();
}
