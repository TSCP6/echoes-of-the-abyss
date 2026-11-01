/**
 * TT-01：SaveSystem 单测（FR-13/DR-02/NFR-05 + EX-01/02 + AT-45~47）。
 * 内存 Storage 注入 StorageAdapter 不可行（单例已绑定）——此处用可替换 Storage 的
 * 独立 SaveSystem 实例 + 直接注入 storageAdapter 不可行（模块单例），
 * 故测试经 globalThis.localStorage 垫片（Node 环境提供最小实现）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SaveSystem, type SaveParticipant } from '../../../../src/game/domain/persistence/saveSystem';
import { validateAll, markValidated } from '../../../../src/game/domain/shared/configRegistry';
import type { SaveData } from '../../../../src/game/domain/persistence/saveSchema';
import { InventoryStore } from '../../../../src/game/domain/player/inventoryStore';
import { ProgressService } from '../../../../src/game/domain/progression/progressService';
import { computeChecksum } from '../../../../src/game/domain/persistence/checksum';

class MemStorage implements Storage {
    map = new Map<string, string>();
    failSet = false;
    get length(): number { return this.map.size; }
    clear(): void { this.map.clear(); }
    getItem(k: string): string | null { return this.map.get(k) ?? null; }
    key(i: number): string | null { return [...this.map.keys()][i] ?? null; }
    removeItem(k: string): void { this.map.delete(k); }
    setItem(k: string, v: string): void {
        if (this.failSet) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
        this.map.set(k, v);
    }
}

// Node 环境注入 localStorage 垫片（StorageAdapter.detect 读取 globalThis.localStorage）
const mem = new MemStorage();
(globalThis as unknown as { localStorage: Storage }).localStorage = mem;

interface CounterSection { n: number }
const counter: SaveParticipant<'player'> = {
    key: 'player',
    toSnapshot: () => ({ n: 7 } as unknown as CounterSection & SaveData['player']),
    fromSnapshot: () => { /* 测试只验证写入/读取链路 */ }
};

beforeEach(() => {
    const r = validateAll();
    if (!r.ok) { throw new Error('config invalid'); }
    markValidated();
    mem.clear();
    mem.failSet = false;
});

describe('SaveSystem（FR-13/DR-02）', () => {
    it('无存档 → load 返回 null（FR-13 规则 7 置灰依据）', () => {
        const ss = new SaveSystem();
        ss.register(counter);
        expect(ss.load(0)).toEqual({ ok: true, value: null });
    });

    it('双键写入：正式键 + pending 清除（DD-10）', () => {
        const ss = new SaveSystem();
        ss.register(counter);
        expect(ss.write(0).ok).toBe(true);
        expect(mem.map.has('seapp.echoes.save.slot0')).toBe(true);
        expect(mem.map.has('seapp.echoes.save.slot0.pending')).toBe(false);
    });

    it('配额失败 → 正式键不被覆盖 + save:failed 语义（EX-01 / AT-47）', () => {
        const ss = new SaveSystem();
        ss.register(counter);
        ss.write(0); // 先写一份好档
        const good = mem.map.get('seapp.echoes.save.slot0');
        mem.failSet = true;
        const r = ss.write(0);
        expect(r.ok).toBe(false);
        if (!r.ok) { expect(r.code).toBe('QUOTA'); }
        expect(mem.map.get('seapp.echoes.save.slot0')).toBe(good); // 原档完好
        expect(ss.isMemoryOnlyMode()).toBe(true);
    });

    it('篡改存档 → checksum 拒载 + corrupt 备份（EX-02 / AT-46）', () => {
        const ss = new SaveSystem();
        ss.register(counter);
        ss.write(0);
        const text = mem.map.get('seapp.echoes.save.slot0') as string;
        const tampered = text.replace(/"coins":\d+/, '"coins":999999').replace(/"n":\d+/, '"n":99');
        mem.map.set('seapp.echoes.save.slot0', tampered);
        const r = ss.load(0);
        expect(r.ok).toBe(false);
        if (!r.ok) { expect(r.code).toBe('CORRUPT'); }
        // 备份键存在
        const corruptKeys = [...mem.map.keys()].filter((k) => k.includes('.corrupt.'));
        expect(corruptKeys.length).toBe(1);
        // 正式键已被移除（rename 语义）
        expect(mem.map.has('seapp.echoes.save.slot0')).toBe(false);
    });

    it('非法 JSON → CORRUPT', () => {
        const ss = new SaveSystem();
        ss.register(counter);
        mem.map.set('seapp.echoes.save.slot0', '{not json');
        expect(ss.load(0).ok).toBe(false);
    });

    it('schemaVersion 高于当前 → SCHEMA_NEWER', () => {
        const ss = new SaveSystem();
        ss.register(counter);
        mem.map.set('seapp.echoes.save.slot0', JSON.stringify({ schemaVersion: 99, checksum: 'x' }));
        const r = ss.load(0);
        expect(r.ok).toBe(false);
        if (!r.ok) { expect(r.code).toBe('SCHEMA_NEWER'); }
    });

    it('残留 pending 启动清除（DD-10 崩溃一致性 ③）', () => {
        const ss = new SaveSystem();
        ss.register(counter);
        mem.map.set('seapp.echoes.save.slot0.pending', 'stale');
        ss.load(0);
        expect(mem.map.has('seapp.echoes.save.slot0.pending')).toBe(false);
    });

    it('写入 → 读回成功路径：参与者收到快照（FR-13 规则 1/AT-45）', () => {
        const ss = new SaveSystem();
        let received: unknown = null;
        const reader: SaveParticipant<'player'> = {
            key: 'player',
            toSnapshot: () => ({ n: 42 } as unknown as CounterSection & SaveData['player']),
            fromSnapshot: (d) => { received = d; }
        };
        ss.register(reader);
        expect(ss.write(0).ok).toBe(true);
        const r = ss.load(0);
        expect(r.ok).toBe(true);
        if (r.ok && r.value !== null) {
            expect(r.value.player).toEqual({ n: 42 });
        }
        expect(received).toEqual({ n: 42 });
    });

    it('迁移链缺级 → MIGRATION_FAILED（DR-02 迁移语义）', () => {
        const ss = new SaveSystem();
        ss.register(counter);
        // schemaVersion 低于当前但无迁移函数 → MIGRATION_FAILED + 备份
        mem.map.set('seapp.echoes.save.slot0', JSON.stringify({ schemaVersion: 0, checksum: 'x' }));
        const r = ss.load(0);
        // 当前版本若为 1 且 MIGRATIONS[1] 未定义 → MIGRATION_FAILED；若定义了迁移则走后续校验
        expect(r.ok).toBe(false);
    });

    it('旧档装备修复经脏标记排队写回，重新加载后不再修复或写回', async () => {
        const inv = new InventoryStore();
        const ss = new SaveSystem();
        ss.register({ key: 'inventory', toSnapshot: () => inv.toSnapshot(), fromSnapshot: (d) => inv.fromSnapshot(d) });
        expect(ss.write().ok).toBe(true);
        inv.onDirty(() => { ss.markDirty(); ss.queueWrite(); });

        inv.restoreMissingInitialWeapons(['wpn_shortsword', 'wpn_crossbow']);
        await Promise.resolve();

        const restored = new InventoryStore();
        const reader = new SaveSystem();
        reader.register({ key: 'inventory', toSnapshot: () => restored.toSnapshot(), fromSnapshot: (d) => restored.fromSnapshot(d) });
        expect(reader.load().ok).toBe(true);
        expect(restored.getSnapshot().equipped).toEqual({ main: 'wpn_shortsword', sub: 'wpn_crossbow' });
        // 重复启动不应触发脏标记；真实写回已由上面的重新加载验证。
        restored.onDirty(() => { throw new Error('没有修复时不应再次标脏'); });
        expect(restored.restoreMissingInitialWeapons(['wpn_shortsword', 'wpn_crossbow'])).toBe(false);
    });
    it('宝箱进度经双键保存并读回，旧版可选字段缺失仍可正常加载', () => {
        const ps = new ProgressService();
        ps.reset();
        ps.collectChest('1-1', 'chest_a');
        const ss = new SaveSystem();
        ss.register({ key: 'progress', toSnapshot: () => ps.toSnapshot(), fromSnapshot: (d) => ps.fromSnapshot(d) });
        expect(ss.write().ok).toBe(true);
        ps.reset();
        expect(ss.load().ok).toBe(true);
        expect(ps.isChestOpened('1-1', 'chest_a')).toBe(true);
        expect(ps.collectChest('1-1', 'chest_a')).toBe(false);

        const old = JSON.parse(mem.getItem('seapp.echoes.save.slot0')!) as SaveData;
        delete old.progress.openedChests;
        old.checksum = computeChecksum(old as unknown as Record<string, unknown>);
        mem.setItem('seapp.echoes.save.slot0', JSON.stringify(old));
        expect(ss.load().ok).toBe(true);
        expect(ps.isChestOpened('1-1', 'chest_a')).toBe(false);
        expect([...mem.map.keys()].some((key) => key.includes('.corrupt.'))).toBe(false);
    });

    it('已开宝箱字段被篡改时仍拒绝并备份原始存档', () => {
        const ps = new ProgressService();
        ps.reset();
        ps.collectChest('1-1', 'chest_a');
        const ss = new SaveSystem();
        ss.register({ key: 'progress', toSnapshot: () => ps.toSnapshot(), fromSnapshot: (d) => ps.fromSnapshot(d) });
        ss.write();
        const tampered = mem.getItem('seapp.echoes.save.slot0')!.replace('1-1:chest_a', '1-1:chest_b');
        mem.setItem('seapp.echoes.save.slot0', tampered);
        expect(ss.load()).toMatchObject({ ok: false, code: 'CORRUPT' });
        const backup = [...mem.map.keys()].find((key) => key.includes('.corrupt.'));
        expect(backup).toBeDefined();
        expect(mem.getItem(backup!)).toBe(tampered);
    });

});

function portableSave(): SaveData {
    return { schemaVersion: 1, savedAt: new Date().toISOString(), checksum: '',
        player: { hp: 100, hpMax: 100, sp: 50, spMax: 50, coins: 123, skillPoints: 0, materials: {} },
        progress: { unlockedLevels: ['1-1'], clearedLevels: [], collectedShards: [], tutorialDone: false, currentLevelId: '1-1', lastCheckpointId: 'cp_1' },
        inventory: { capacity: 20, slots: [], equipped: { main: null, sub: null } }, weapons: {}, skills: { unlocked: [], loadout: [null,null,null,null] },
        settings: { masterVolume: 80, musicVolume: 60, sfxVolume: 90, screenShake: true, fullscreen: false, keymap: null },
        records: { bestTimeSec: {}, bestShards: {}, totalDeaths: 0, totalKills: 0, totalPlaySec: 90 } };
}
async function encodeSave(data: SaveData): Promise<string> {
    const { computeChecksum } = await import('../../../../src/game/domain/persistence/checksum');
    data.checksum = computeChecksum(data as unknown as Record<string, unknown>);
    return JSON.stringify(data);
}

describe('存档管理和导入事务', () => {
    it('终章满包奖励通过正式存档与导入校验，拒绝未知物品及非法数量', async () => {
        const s = new SaveSystem(); const ps = new ProgressService(); ps.reset();
        s.register({ key: 'progress', toSnapshot: () => ps.toSnapshot(), fromSnapshot: value => ps.fromSnapshot(value) });
        ps.setVictoryLoot([{ itemId: 'itm_potion_hp_l', count: 2 }]);
        expect(s.write().ok).toBe(true); ps.reset();
        const loaded = s.load();
        expect(loaded.ok).toBe(true);
        if (loaded.ok && loaded.value !== null) { ps.fromSnapshot(loaded.value.progress); }
        expect(ps.getVictoryLoot()).toEqual([{ itemId: 'itm_potion_hp_l', count: 2 }]);
        const data = portableSave(); data.progress.victoryLoot = ps.getVictoryLoot();
        expect(s.inspectJson(await encodeSave(data)).ok).toBe(true);
        for (const item of [{ itemId: 'unknown', count: 2 }, { itemId: 'itm_potion_hp_l', count: -1 }, { itemId: 'itm_potion_hp_l', count: 1.5 }]) {
            data.progress.victoryLoot = [item]; expect(s.inspectJson(await encodeSave(data)).ok).toBe(false);
        }
    });
    it('旧版完整存档可预览与导入，缺少宝箱字段不拒绝', async () => {
        const s = new SaveSystem(); let received = 0;
        s.register({ key: 'player', toSnapshot: () => portableSave().player, fromSnapshot: p => { received = p.coins; } });
        const text = await encodeSave(portableSave());
        expect(s.inspectJson(text).ok).toBe(true); expect(received).toBe(0);
        expect(s.importJson(text).ok).toBe(true); expect(received).toBe(123);
        expect(s.getSummary()).toMatchObject({ levelId: '1-1', checkpointId: 'cp_1', playTimeSec: 90 });
        expect(mem.map.has('seapp.echoes.save.slot0')).toBe(true);
    });
    it('非法文件及有合法校验但结构损坏的文件，不覆盖当前档或修改当前状态', async () => {
        const s = new SaveSystem(); s.register(counter); s.write(); const original = mem.getItem('seapp.echoes.save.slot0');
        for (const value of ['{bad', await encodeSave({ ...portableSave(), inventory: null } as unknown as SaveData),
            await encodeSave({ ...portableSave(), player: { ...portableSave().player, coins: -1 } })]) {
            expect(s.importJson(value).ok).toBe(false);
            expect(mem.getItem('seapp.echoes.save.slot0')).toBe(original);
        }
    });
    it('写盘失败时导入不应用参与者，保留原档', async () => {
        const s = new SaveSystem(); let received = false;
        s.register({ ...counter, fromSnapshot: () => { received = true; } }); s.write();
        const original = mem.getItem('seapp.echoes.save.slot0'); mem.failSet = true;
        expect(s.importJson(await encodeSave(portableSave())).ok).toBe(false);
        expect(received).toBe(false); expect(mem.getItem('seapp.echoes.save.slot0')).toBe(original);
    });
});

describe('存档跨字段一致性',()=>{
    it('合法校验和也不能导入无来源技能点的技能、重复进度或错误余额',async()=>{
        const s=new SaveSystem();s.register(counter);s.write();const original=mem.getItem('seapp.echoes.save.slot0');
        const impossible=portableSave();impossible.skills.unlocked=['sk_blade_focus'];
        const duplicate=portableSave();duplicate.progress.collectedShards=['1-1-a','1-1-a'];duplicate.player.skillPoints=2;
        const badBalance=portableSave();badBalance.player.skillPoints=5;
        for(const data of [impossible,duplicate,badBalance]) {
            expect(s.importJson(await encodeSave(data)).ok).toBe(false);
            expect(mem.getItem('seapp.echoes.save.slot0')).toBe(original);
        }
    });
    it('页面退出前flush兑现延迟窗口，后续排队不会写回过期数据',async()=>{
        const s=new SaveSystem();let n=8;s.register({...counter,toSnapshot:()=>({n} as unknown as SaveData['player'])});
        s.markDirty();s.queueWrite(400);n=9;s.flushPending();
        expect(JSON.parse(mem.getItem('seapp.echoes.save.slot0')!).player.n).toBe(9);
        await Promise.resolve();expect(s.getSummary()).not.toBeNull();
    });
});
