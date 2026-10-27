/**
 * UI-C6：全部界面文案集中管理（简体中文，约束 C7）。错误码 → 文案映射同址（E-1）。
 */
export const UI_TEXT = {
    title: '深渊回响',
    subtitle: 'Echoes of the Abyss',
    menu: {
        start: '开始游戏',
        continue: '继续游戏',
        levelSelect: '关卡选择',
        settings: '设置',
        help: '操作说明',
        records: '本地最佳榜',
        confirmOverwrite: '已有存档，开始新游戏将覆盖进度，确认？',
        confirmYes: '确认覆盖',
        confirmNo: '取消'
    },
    levelSelect: {
        title: '关卡选择',
        locked: '未解锁',
        back: '返回主菜单',
        sceneNames: ['森林遗迹', '地下洞窟', '天空神殿'] as string[]
    },
    pause: {
        title: '已暂停',
        resume: '继续',
        settings: '设置',
        help: '操作说明',
        saveQuit: '保存并退出',
        abandon: '放弃本关',
        abandonHint: '放弃不写入存档，本关进度丢失'
    },
    result: {
        cleared: '关卡完成',
        time: '用时',
        kills: '击杀',
        shards: '回响碎片',
        coins: '金币',
        newRecord: '新纪录',
        next: '下一关',
        retry: '重试',
        back: '返回关卡选择'
    },
    help: {
        title: '操作说明',
        back: '返回',
        flowTitle: '冒险流程',
        flow: '探索关卡、跳跃战斗 → 收集金币和回响碎片 → 激活检查点 → 到达终点解锁下一关。共 3 个区域，每区第 4 关击败 Boss 后才能通关。',
        coin: '金币：金色圆币。在「关卡选择 → 营地」按交互键打开商店，购买弹药、药水、武器或强化装备。',
        shard: '回响碎片：青色晶体。每枚增加 1 技能点（SKP），在技能树学习技能；主动技能装备后用 1–4 释放，消耗技能能量（SP）。',
        material: '遗迹残片：紫色材料标记。与金币一起用于强化武器，与学习技能的回响碎片分别计数。',
        ranged: '远程攻击：白蓝色箭形弹丸。初始副手轻弩每发消耗 1 支箭，受武器攻速和射程限制；飞镖枪使用飞镖。',
        ammo: '新游戏有 20 支箭；背包点击弹药不会射击。弹药不足时回营地补给，也可拾取飞行敌人掉落的箭矢。常规近战攻击不消耗弹药。',
        supplies: '当前商店补给',
        rows: [
            ['水平移动', 'A / D 或 ← / →'],
            ['跳跃', 'Space（短按截断跳高）'],
            ['主手攻击', 'J 或 鼠标左键'],
            ['副手攻击', 'K 或 鼠标右键'],
            ['技能 1~4', '1 / 2 / 3 / 4'],
            ['交互', 'E'],
            ['背包', 'Tab'],
            ['技能树', 'Y'],
            ['暂停 / 菜单', 'Esc'],
            ['全屏', 'F']
        ] as Array<[string, string]>
    },
    hud: {
        level: '关卡',
        checkpoints: '检查点',
        hp: '生命', sp: '技能能量', coins: '金币', skillPoints: '技能点', materials: '强化残片',
        main: '主手', sub: '副手', emptyHand: '未装备', melee: '近战 · 无需弹药',
        ammoLow: '弹药不足', ammoEmpty: '弹药耗尽',
        resupply: '补给：关卡选择 → 营地 →', shop: '商店'
    },
    inventory: {
        ammoHint: '这是弹药，请返回关卡，用装备的远程武器攻击；初始轻弩按 K / 鼠标右键射击。',
        controls: '左键使用药水 ｜ 右键装主手 ｜ 双击装副手',
        ammoNote: '弹药由远程武器消耗，点击弹药不会投掷。'
    }
} as const;
