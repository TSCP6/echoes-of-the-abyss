/**
 * IF-M01 统一结果类型与全局错误码登记表（设计文档 6.1.1）。
 * E-1：可预期失败一律 Result 返回，调用方必须处理失败分支；
 * E-2：程序性错误抛 Error，由 EXD-4 全局兜底；
 * 新增错误码必须在 ErrorCode 登记，禁止散落字符串字面量。
 */
export type ErrorCode =
    | 'COINS_INSUFFICIENT' | 'MATERIAL_INSUFFICIENT' | 'INVENTORY_FULL'
    | 'SKP_INSUFFICIENT' | 'PREREQ_LOCKED' | 'ALREADY_UNLOCKED' | 'ALREADY_OWNED' | 'MAX_LEVEL'
    | 'AMMO_EMPTY' | 'ON_COOLDOWN' | 'SP_INSUFFICIENT' | 'LOADOUT_FULL'
    | 'SLOT_EMPTY' | 'NOT_USABLE' | 'ALREADY_EQUIPPED'
    | 'LEVEL_LOCKED' | 'LEVEL_NOT_FOUND'
    | 'CONFIG_INVALID' | 'MAP_INVALID' | 'ASSET_MISSING'
    | 'QUOTA' | 'UNAVAILABLE' | 'CORRUPT' | 'MIGRATION_FAILED' | 'SCHEMA_NEWER'
    | 'STORAGE_UNAVAILABLE' | 'AUDIO_BLOCKED' | 'FULLSCREEN_REJECTED'
    | 'INVALID_VALUE'    // EX-09 数值拦截
    // 按 E-1 规则补登记：IF-M05 tryCast 与 IF-M11 remap 的签名引用了这两个错误码，
    // 设计文档 6.1.1 登记表漏列，此处依"新增错误码必须在此登记"规则补齐。
    | 'NOT_UNLOCKED' | 'KEY_CONFLICT';

export type Result<T, C extends ErrorCode = ErrorCode> =
    | { ok: true; value: T }
    | { ok: false; code: C; message: string };

export function ok<T>(value: T): { ok: true; value: T } {
    return { ok: true, value };
}

export function fail<C extends ErrorCode>(code: C, message: string): { ok: false; code: C; message: string } {
    return { ok: false, code, message };
}
