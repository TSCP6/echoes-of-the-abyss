import type { SkillDef } from '../game/domain/types';

/** 介绍中的数值读配置，避免技能调整后文案失真。 */
export function describeSkill(def: SkillDef): string {
    const e = def.effect;
    if (def.kind === 'passive') {
        const effects = [e.damagePct ? `所有武器伤害加成 +${e.damagePct}%` : '',
            def.passiveHpBonus ? `生命上限 +${def.passiveHpBonus}` : '',
            def.passiveSpBonus ? `技能能量上限 +${def.passiveSpBonus}` : ''].filter(Boolean);
        return `学习后永久生效，无需放入技能栏：${effects.join('；')}。`;
    }
    let effect = '';
    if (e.radius !== undefined) { effect = `对周围 ${e.radius}px 内的敌人造成 ${e.damage} 点基础伤害。`; }
    else if (e.projectileCount !== undefined) { effect = `向面朝方向扇形发射 ${e.projectileCount} 枚弹丸，每枚 ${e.damage} 点基础伤害，散射角 ${e.spreadDeg}°。需要装备远程武器，技能消耗 SP，不消耗普通弹药。`; }
    else if (e.dashDistance !== undefined) { effect = `向面朝方向冲刺 ${e.dashDistance}px，获得 ${e.invincibleMs} 毫秒无敌；实体墙会阻挡冲刺。`; }
    else if (e.heal !== undefined) { effect = `立即恢复 ${e.heal} 点生命，不超过生命上限。`; }
    return `${effect} 消耗 ${def.spCost} SP，冷却 ${def.cooldown} 秒。`;
}
