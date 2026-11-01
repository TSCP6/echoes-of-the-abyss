/**
 * TT-01：FNV-1a 校验和单测（DD-09 / DR-02 校验和算法）。
 * 黄金样本 + 键序无关性 + checksum 字段忽略。
 */
import { describe, it, expect } from 'vitest';
import { fnv1a32, canonicalJson, computeChecksum } from '../../../../src/game/domain/persistence/checksum';

describe('fnv1a32（黄金样本）', () => {
    it('空串 → 偏移基 2166136261 = 811c9dc5', () => {
        expect(fnv1a32('').toString(16).padStart(8, '0')).toBe('811c9dc5');
    });
    it('"a" → e40c292c（FNV-1a 标准向量）', () => {
        expect(fnv1a32('a').toString(16).padStart(8, '0')).toBe('e40c292c');
    });
    it('"foobar" → bf9cf968（FNV-1a 标准向量）', () => {
        expect(fnv1a32('foobar').toString(16).padStart(8, '0')).toBe('bf9cf968');
    });
});

describe('canonicalJson（键字典序 + 无空白）', () => {
    it('键按字典序排序', () => {
        expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    });
    it('嵌套对象递归排序', () => {
        expect(canonicalJson({ z: { b: 1, a: 2 }, a: 1 })).toBe('{"a":1,"z":{"a":2,"b":1}}');
    });
    it('数组保持顺序', () => {
        expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
    });
    it('undefined 值键被剔除', () => {
        expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
    });
});

describe('computeChecksum（存档）', () => {
    it('键序无关：同内容不同插入序 → 同 checksum', () => {
        const a = computeChecksum({ schemaVersion: 1, coins: 10 });
        const b = computeChecksum({ coins: 10, schemaVersion: 1 });
        expect(a).toBe(b);
        expect(a).toMatch(/^[0-9a-f]{8}$/);
    });
    it('忽略已有 checksum 字段', () => {
        const base = computeChecksum({ schemaVersion: 1, coins: 10 });
        const withCk = computeChecksum({ schemaVersion: 1, coins: 10, checksum: 'ffffffff' });
        expect(withCk).toBe(base);
    });
    it('内容变更 → checksum 变更', () => {
        expect(computeChecksum({ coins: 10 })).not.toBe(computeChecksum({ coins: 11 }));
    });
});
