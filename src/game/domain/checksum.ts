/**
 * DD-09：存档校验和（DR-02 算法）——移除 checksum 字段 → 键按字典序递归规范化、
 * 无多余空白的 JSON → FNV-1a 32 位 → 8 位小写十六进制。
 * 纯函数，黄金样本单测（TT-01）。
 */
const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;

/** FNV-1a 32 位哈希（逐 UTF-8 字节；Math.imul 保证 32 位乘法语义）。 */
export function fnv1a32(text: string): number {
    const bytes = new TextEncoder().encode(text);
    let hash = FNV_OFFSET_BASIS;
    for (const byte of bytes) {
        hash = Math.imul(hash ^ byte, FNV_PRIME) >>> 0;
    }
    return hash >>> 0;
}

/** 键按字典序递归排序、无空白的规范化 JSON（DR-02 校验和算法的规范化步骤）。 */
export function canonicalJson(value: unknown): string {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value) ?? 'null';
    }
    if (Array.isArray(value)) {
        return `[${value.map(canonicalJson).join(',')}]`;
    }
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}

/** 对存档对象计算 checksum（自动忽略已有的 checksum 字段）。 */
export function computeChecksum(save: Record<string, unknown>): string {
    const rest: Record<string, unknown> = {};
    for (const key of Object.keys(save)) {
        if (key !== 'checksum') {
            rest[key] = save[key];
        }
    }
    return fnv1a32(canonicalJson(rest)).toString(16).padStart(8, '0');
}
