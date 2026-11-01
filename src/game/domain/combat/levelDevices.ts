/** Tiled 机关状态；只处理规则，Phaser 呈现与碰撞在 systems/levelDeviceSystem。 */
export interface LevelDevice {
    id: string;
    kind: 'switch' | 'gate' | 'crumble' | 'sign';
    x: number;
    y: number;
    width: number;
    height: number;
    group: string;
    order: number;
    label: string;
}

export class DeviceState {
    private active = new Set<string>();
    constructor(private readonly devices: readonly LevelDevice[]) {}

    isActive(id: string): boolean { return this.active.has(id); }
    reset(): void { this.active.clear(); }

    activate(id: string, px: number, py: number): 'far' | 'already' | 'wrong-order' | 'activated' {
        const device = this.devices.find(d => d.id === id && d.kind === 'switch');
        if (device === undefined || Math.abs(px - device.x) > 76 || Math.abs(py - device.y) > 88) { return 'far'; }
        if (this.active.has(id)) { return 'already'; }
        const group = this.devices.filter(d => d.kind === 'switch' && d.group === device.group);
        if (device.order > 0 && group.some(d => d.order < device.order && !this.active.has(d.id))) {
            for (const d of group) { this.active.delete(d.id); }
            return 'wrong-order';
        }
        this.active.add(id);
        return 'activated';
    }

    isGateOpen(gate: LevelDevice): boolean {
        const switches = this.devices.filter(d => d.kind === 'switch' && d.group === gate.group);
        return switches.length > 0 && switches.every(d => this.active.has(d.id));
    }
}

export interface CrumbleState {
    phase: 'stable' | 'warning' | 'missing';
    elapsed: number;
}

export function advanceCrumble(state: CrumbleState, standing: boolean, dt: number): CrumbleState {
    if (state.phase === 'stable') {
        return standing ? { phase: 'warning', elapsed: Math.max(0, dt) } : state;
    }
    const elapsed = state.elapsed + Math.max(0, dt);
    if (state.phase === 'warning' && elapsed >= 1) { return { phase: 'missing', elapsed: 0 }; }
    if (state.phase === 'missing' && elapsed >= 3) { return { phase: 'stable', elapsed: 0 }; }
    return { ...state, elapsed };
}
