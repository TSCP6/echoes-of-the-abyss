/**
 * TT-02：StorageAdapter 单测（IF-X01 / EX-01 检测点）。
 * 以内存 Map 模拟 Storage 注入（13.2 mock 接缝），验证白名单、错误翻译、双键原语。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { StorageAdapter } from './storageAdapter';
import { saveKey, pendingKey } from '../domain/saveSchema';

class MockStorage implements Storage {
    map = new Map<string, string>();
    throwOnSet: string | null = null; // 注入异常：键名或 '*'
    get length(): number { return this.map.size; }
    clear(): void { this.map.clear(); }
    getItem(key: string): string | null { return this.map.get(key) ?? null; }
    key(index: number): string | null { return [...this.map.keys()][index] ?? null; }
    removeItem(key: string): void { this.map.delete(key); }
    setItem(key: string, value: string): void {
        if (this.throwOnSet === '*' || this.throwOnSet === key) {
            const err = new Error('quota');
            err.name = 'QuotaExceededError';
            throw err;
        }
        this.map.set(key, value);
    }
}

describe('StorageAdapter（IF-X01）', () => {
    let mock: MockStorage;
    let adapter: StorageAdapter;
    beforeEach(() => {
        mock = new MockStorage();
        adapter = new StorageAdapter(mock);
    });

    it('读写删基本链路', () => {
        const k = saveKey(0);
        expect(adapter.read(k)).toBeNull();
        expect(adapter.writeAtomic(k, '{"a":1}').ok).toBe(true);
        expect(adapter.read(k)).toBe('{"a":1}');
        adapter.remove(k);
        expect(adapter.read(k)).toBeNull();
    });

    it('键名白名单：越界抛错（6.3.1 调用限制）', () => {
        expect(() => adapter.read('evil.key')).toThrow();
        expect(() => adapter.writeAtomic('other', 'x')).toThrow();
    });

    it('配额异常翻译为 QUOTA（EX-01）', () => {
        mock.throwOnSet = '*';
        const r = adapter.writeAtomic(saveKey(0), 'x');
        expect(r.ok).toBe(false);
        if (!r.ok) { expect(r.code).toBe('QUOTA'); }
    });

    it('双键写入原语：pending 失败不影响正式键（DD-10 崩溃一致性 ①）', () => {
        const main = saveKey(0);
        adapter.writeAtomic(main, 'GOOD');
        mock.throwOnSet = pendingKey(0);
        const r = adapter.writeAtomic(pendingKey(0), 'NEW');
        expect(r.ok).toBe(false);
        expect(adapter.read(main)).toBe('GOOD'); // 正式键未动
    });

    it('rename：损坏备份迁移（EX-02）', () => {
        const main = saveKey(0);
        adapter.writeAtomic(main, 'CORRUPTED');
        const r = adapter.rename(main, `${main}.corrupt.2026-10-19T00:00:00Z`);
        expect(r.ok).toBe(true);
        expect(adapter.read(main)).toBeNull();
        expect(adapter.read(`${main}.corrupt.2026-10-19T00:00:00Z`)).toBe('CORRUPTED');
    });

    it('probe：正常环境通过', () => {
        expect(adapter.probe().ok).toBe(true);
        expect(mock.map.has('seapp.echoes.probe')).toBe(false); // 探测后清除
    });

    it('不可用环境：probe 返回 STORAGE_UNAVAILABLE（EX-01）', () => {
        const dead = new StorageAdapter(null as unknown as Storage);
        // 注入 null 会走 detect 分支失败路径——此处用空实现模拟抛错
        const throwing = {
            getItem: () => { throw new Error('denied'); },
            setItem: () => { throw new Error('denied'); },
            removeItem: () => { throw new Error('denied'); },
            clear: () => { throw new Error('denied'); },
            key: () => null,
            length: 0
        } as unknown as Storage;
        const a2 = new StorageAdapter(throwing);
        expect(a2.probe().ok).toBe(false);
        expect(dead.read(saveKey(0))).toBeNull();
    });
});
