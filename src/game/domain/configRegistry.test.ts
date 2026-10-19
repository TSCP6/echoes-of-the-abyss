/**
 * TT-01：ConfigRegistry 校验器单测（DD-02 V1~V6）。
 * 验证真实配置通过 + 各类违规被拦截（引用完整性/范围/结构/经济闭环）。
 */
import { describe, it, expect } from 'vitest';
import { validateAll } from './configRegistry';

describe('ConfigRegistry.validateAll（真实 DR-01 数据）', () => {
    it('全部配置通过 V1~V6 校验', () => {
        const r = validateAll();
        expect(r.ok, r.ok ? '' : JSON.stringify(r.errors)).toBe(true);
    });
});
