/**
 * ARCH-6：领域层 → Vue 反应式桥接。领域单例非响应式；useDomainStore 以 shallowRef
 * 持有快照，subscribe 回调触发整体替换（UI 永远读到一致快照；事件风暴下 Vue 批量更新）。
 * 不引入 Pinia（DEC-5）。
 */
import { onScopeDispose, shallowRef, type ShallowRef } from 'vue';

export function useDomainStore<T>(
    read: () => T,
    subscribe: (onChange: () => void) => () => void
): ShallowRef<T> {
    const snapshot = shallowRef(read()) as ShallowRef<T>;
    const refresh = (): void => { snapshot.value = read(); };
    const unsubscribe = subscribe(refresh);
    onScopeDispose(unsubscribe);
    return snapshot;
}
