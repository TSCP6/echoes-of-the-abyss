/**
 * 启动完成同步（设计 6.2.4，非事件）：Preloader 完成配置校验、资源加载与读档后 resolve；
 * 失败 reject 并由 LoadingView 呈现 EX-03 重试页。Vue UiLayer 直接 import 该 Promise（ARCH-3）。
 */
import type { SaveData } from './saveSchema';

export interface BootResult {
    save: SaveData | null; // M1 恒 null（SaveSystem 于 P3 接入）
    configErrors: string[];
}

let resolveBoot!: (r: BootResult) => void;
let rejectBoot!: (e: Error) => void;

export const AppBoot = {
    ready: new Promise<BootResult>((res, rej) => {
        resolveBoot = res;
        rejectBoot = rej;
    }),
    resolve(result: BootResult): void { resolveBoot(result); },
    reject(err: Error): void { rejectBoot(err); }
};
