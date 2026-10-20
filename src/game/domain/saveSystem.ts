/**
 * MOD-20 SaveSystem（领域层，IF-M16）—— FR-13/DR-02/NFR-05 全部存档机制。
 * ParticipantRegistry：八 store 注册 { key, toSnapshot, fromSnapshot }，SaveSystem 不 import 具体 store 类型；
 * checksum：FNV-1a 32（DD-09）；迁移链：版本升序执行，失败/超版本 → CORRUPT（DR-02）；
 * 双键写入状态机（DD-10）：pending → 正式 → 清 pending；失败 → save:failed → MemoryOnly（EX-01）；
 * 写入点白名单（FR-13 规则 2 四时机 + 死亡重生后）；markDirty 帧内安全（仅置位），写入排队管线外。
 * 损坏处置（EX-02）：重命名 *.corrupt.<ts> + 新档 + UI 弹窗（Vue 订阅 load 结果）。
 */
import { ok, fail, type Result } from './result';
import { computeChecksum } from './checksum';
import { storageAdapter } from '../adapters/storageAdapter';
import {
    CURRENT_SCHEMA_VERSION, saveKey, pendingKey, corruptKey,
    type SaveData
} from './saveSchema';
import { emitEvent } from '../events';

export type LoadErrorCode = 'CORRUPT' | 'MIGRATION_FAILED' | 'SCHEMA_NEWER' | 'STORAGE_UNAVAILABLE';

export interface SaveParticipant<K extends keyof SaveData> {
    readonly key: K;
    toSnapshot(): SaveData[K];
    fromSnapshot(data: SaveData[K]): void;
}

const MIGRATIONS: Record<number, (old: unknown) => unknown> = {
    // 2: v1ToV2 …（当前版本 1，链为空——机制先行，7.3.4）
};

export class SaveSystem {
    private participants: SaveParticipant<keyof SaveData>[] = [];
    private memoryOnly = false;
    private memorySnapshot: SaveData | null = null;
    private dirty = false;
    private writeQueued = false;

    register<K extends keyof SaveData>(p: SaveParticipant<K>): void {
        this.participants.push(p as SaveParticipant<keyof SaveData>);
    }

    markDirty(): void { this.dirty = true; }

    isMemoryOnlyMode(): boolean { return this.memoryOnly; }

    /** 聚合八 store 快照（K4：同一帧管线外一次性采集） */
    private aggregate(): SaveData {
        const data = {} as Record<string, unknown>;
        for (const p of this.participants) {
            data[p.key as string] = p.toSnapshot();
        }
        const withMeta: SaveData = {
            schemaVersion: CURRENT_SCHEMA_VERSION,
            checksum: '',
            savedAt: new Date().toISOString(),
            ...(data as Omit<SaveData, 'schemaVersion' | 'checksum' | 'savedAt'>)
        };
        withMeta.checksum = computeChecksum(withMeta as unknown as Record<string, unknown>);
        return withMeta;
    }

    /** FR-13：双键原子写（DD-10）。成功 save:written；失败 save:failed + MemoryOnly（EX-01） */
    write(slot: 0 = 0): Result<void, 'QUOTA' | 'UNAVAILABLE'> {
        this.dirty = false;
        const snapshot = this.aggregate();
        const text = JSON.stringify(snapshot);
        const main = saveKey(slot);
        const pending = pendingKey(slot);

        const wPending = storageAdapter.writeAtomic(pending, text);
        if (!wPending.ok) { return this.onWriteFail(wPending.code, slot); }
        const wMain = storageAdapter.writeAtomic(main, text);
        if (!wMain.ok) { return this.onWriteFail(wMain.code, slot); }
        storageAdapter.remove(pending);
        this.memoryOnly = false;
        emitEvent('save:written', { slot, at: snapshot.savedAt });
        return ok(undefined);
    }

    private onWriteFail(code: 'QUOTA' | 'UNAVAILABLE', slot: 0): Result<void, 'QUOTA' | 'UNAVAILABLE'> {
        this.memoryOnly = true;
        this.memorySnapshot = this.aggregate();
        emitEvent('save:failed', { slot, reason: code });
        return fail(code, code === 'QUOTA' ? '存储配额已满' : '存储不可用');
    }

    /** 管线外排队：同帧多次脏标记合并为一次写入（4.3.8） */
    queueWrite(): void {
        if (!this.dirty || this.writeQueued) { return; }
        this.writeQueued = true;
        // 微任务即"管线外"（帧 update 已结束）；写入同步完成 ≤50ms 预算（NFR-05）
        queueMicrotask(() => {
            this.writeQueued = false;
            if (this.dirty) { this.write(0); }
        });
    }

    /** EX-01 降级：用户手动重试（恢复权限后） */
    retryWrite(): Result<void, 'QUOTA' | 'UNAVAILABLE'> {
        return this.write(0);
    }

    /** EX-01 降级：导出 JSON 下载 */
    exportJson(): void {
        const snapshot = this.memorySnapshot ?? this.aggregate();
        storageAdapter.exportAsDownload(`echoes-save-${Date.now()}.json`, JSON.stringify(snapshot, null, 2));
    }

    /** FLOW-R1：读档 + 校验 + 迁移 + 损坏处置（EX-02）。null = 无存档 */
    load(slot: 0 = 0): Result<SaveData | null, LoadErrorCode> {
        // 启动清理残留 pending（DD-10 崩溃一致性 ③）
        storageAdapter.remove(pendingKey(slot));
        const probe = storageAdapter.probe();
        if (!probe.ok) { return fail('STORAGE_UNAVAILABLE', 'localStorage 不可用'); }
        const text = storageAdapter.read(saveKey(slot));
        if (text === null) { return ok(null); }

        let parsed: unknown;
        try {
            parsed = JSON.parse(text);
        } catch {
            return this.handleCorrupt(slot, text);
        }
        const data = parsed as SaveData;
        if (typeof data !== 'object' || data === null || typeof data.schemaVersion !== 'number') {
            return this.handleCorrupt(slot, text);
        }
        if (data.schemaVersion > CURRENT_SCHEMA_VERSION) {
            return this.handleCorrupt(slot, text, 'SCHEMA_NEWER');
        }
        // 迁移链（DR-02）：深拷贝后逐级执行
        let migrated: unknown = JSON.parse(JSON.stringify(data));
        for (let v = data.schemaVersion; v < CURRENT_SCHEMA_VERSION; v++) {
            const fn = MIGRATIONS[v + 1];
            if (fn === undefined) { return this.handleCorrupt(slot, text, 'MIGRATION_FAILED'); }
            try {
                migrated = fn(migrated);
            } catch {
                return this.handleCorrupt(slot, text, 'MIGRATION_FAILED');
            }
        }
        const finalData = migrated as SaveData;
        // checksum 校验（篡改拒载，AT-46/NFR-09）
        const expected = computeChecksum(finalData as unknown as Record<string, unknown>);
        if (finalData.checksum !== expected) {
            return this.handleCorrupt(slot, text);
        }
        this.applyToParticipants(finalData);
        return ok(finalData);
    }

    private handleCorrupt(slot: 0, _text: string, code: LoadErrorCode = 'CORRUPT'): Result<SaveData | null, LoadErrorCode> {
        // EX-02：备份现场 + 新档（不整档作废之外的副作用）
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        storageAdapter.rename(saveKey(slot), corruptKey(slot, ts));
        return fail(code, code === 'CORRUPT' ? '存档损坏，已备份并新建' : `存档版本异常：${code}`);
    }

    private applyToParticipants(data: SaveData): void {
        const record = data as unknown as Record<string, unknown>;
        for (const p of this.participants) {
            const section = record[p.key as string];
            if (section !== undefined) {
                p.fromSnapshot(section as SaveData[typeof p.key]);
            }
        }
    }

}

/** 全局单例 */
export const saveSystem = new SaveSystem();
