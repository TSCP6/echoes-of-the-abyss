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
        shards: '碎片',
        coins: '金币',
        newRecord: '新纪录',
        next: '下一关',
        retry: '重试',
        back: '返回关卡选择'
    },
    help: {
        title: '操作说明',
        back: '返回',
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
        checkpoints: '检查点'
    }
} as const;
