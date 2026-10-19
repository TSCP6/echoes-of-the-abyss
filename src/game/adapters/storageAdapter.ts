/**
 * MOD-37 StorageAdapter（平台适配层，IF-X01）—— 封装 localStorage（DR-05 / EX-01 检测点）。
 * 上层禁止裸 localStorage（ARCH-11）；键名白名单 seapp.echoes.*（6.3.1 调用限制）。
 * 错误翻译：QuotaExceededError → 'QUOTA'；SecurityError/访问抛错 → 'UNAVAILABLE'；不抛裸异常。
 * 双键原子写的事务编排（DD-10）由 SaveSystem 以本适配器的原语完成（pending → 正式 → 清 pending）。
 * 测试接缝：构造时可注入 Storage 实现（13.2 mock 接缝）。
 */
import { ok, fail, type Result } from '../domain/result';
import { SAVE_KEY_PREFIX, PROBE_KEY } from '../domain/saveSchema';

export class StorageAdapter {
    private storage: Storage | null;

    constructor(storage?: Storage) {
        this.storage = storage ?? StorageAdapter.detect();
    }

    private static detect(): Storage | null {
        try {
            return typeof globalThis.localStorage !== 'undefined' ? globalThis.localStorage : null;
        } catch {
            return null; // 隐私模式访问即抛 SecurityError
        }
    }

    private assertWhitelist(key: string): void {
        if (!key.startsWith(SAVE_KEY_PREFIX)) {
            throw new Error(`[StorageAdapter] 键名越界白名单 ${SAVE_KEY_PREFIX}*：${key}`);
        }
    }

    private translate(err: unknown): 'QUOTA' | 'UNAVAILABLE' {
        const name = err instanceof Error ? err.name : '';
        return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' ? 'QUOTA' : 'UNAVAILABLE';
    }

    read(key: string): string | null {
        this.assertWhitelist(key);
        if (this.storage === null) { return null; }
        try {
            return this.storage.getItem(key);
        } catch {
            return null;
        }
    }

    /** 单键原子写（浏览器 setItem 语义）；失败保证该键未被修改 */
    writeAtomic(key: string, value: string): Result<void, 'QUOTA' | 'UNAVAILABLE'> {
        this.assertWhitelist(key);
        if (this.storage === null) { return fail('UNAVAILABLE', 'localStorage 不可用'); }
        try {
            this.storage.setItem(key, value);
            return ok(undefined);
        } catch (err) {
            return fail(this.translate(err), `写入 ${key} 失败`);
        }
    }

    remove(key: string): void {
        this.assertWhitelist(key);
        if (this.storage === null) { return; }
        try {
            this.storage.removeItem(key);
        } catch {
            // 删除失败不阻断流程（残留 pending 由启动清理处理，DD-10 崩溃一致性 ③）
        }
    }

    /** EX-02：损坏存档备份重命名（读旧 → 写新 → 删旧） */
    rename(key: string, newKey: string): Result<void, 'UNAVAILABLE'> {
        this.assertWhitelist(key);
        this.assertWhitelist(newKey);
        if (this.storage === null) { return fail('UNAVAILABLE', 'localStorage 不可用'); }
        try {
            const value = this.storage.getItem(key);
            if (value !== null) { this.storage.setItem(newKey, value); }
            this.storage.removeItem(key);
            return ok(undefined);
        } catch {
            return fail('UNAVAILABLE', `重命名 ${key} → ${newKey} 失败`);
        }
    }

    /** 启动可用性探测：1 字节写读删（DD-07 seapp.echoes.probe） */
    probe(): Result<void, 'STORAGE_UNAVAILABLE'> {
        if (this.storage === null) { return fail('STORAGE_UNAVAILABLE', 'localStorage 不可访问'); }
        try {
            this.storage.setItem(PROBE_KEY, '1');
            this.storage.getItem(PROBE_KEY);
            this.storage.removeItem(PROBE_KEY);
            return ok(undefined);
        } catch {
            return fail('STORAGE_UNAVAILABLE', 'localStorage 探测失败（隐私模式/禁用站点数据）');
        }
    }

    /** EX-01 降级：导出存档 JSON 为下载文件（Blob + a[download]） */
    exportAsDownload(filename: string, content: string): void {
        if (typeof document === 'undefined' || typeof Blob === 'undefined') { return; } // 非浏览器环境（单测）静默跳过
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

/** 全局单例（浏览器默认 localStorage） */
export const storageAdapter = new StorageAdapter();
