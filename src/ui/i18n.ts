/**
 * UI-C6：全部界面文案集中管理（简体中文，约束 C7）。错误码 → 文案映射同址（E-1）。
 */
export const UI_TEXT = {
    skillTree: {
        title: '技能树', branches: { blade: '刃影', bolt: '弩矢', ruin: '遗迹' }, empty: '待绑定',
        intro: '技能点用于学习，不会直接变成技能。点击技能查看介绍并保持选择 → 学习 → 主动技能绑定 1–4；被动技能学习后自动生效。入门可用 2 点学习回响冲刺。',
        passiveReady: '已学习，被动持续生效，无需绑定', activeReady: '已学习；选择上方槽位，再点击绑定',
        canLearn: '满足条件，可以学习', full: '已学习；技能栏已满，请选择槽位并绑定替换'
    },
    title: '深渊回响',
    subtitle: 'Echoes of the Abyss',
    menu: {
        start: '开始游戏',
        continue: '继续游戏',
        levelSelect: '关卡选择',
        settings: '设置',
        help: '操作说明',
        records: '本地最佳榜',
        saves: '存档管理',
        confirmOverwrite: '已有存档，开始新游戏将覆盖进度，确认？',
        confirmYes: '确认覆盖',
        confirmNo: '取消'
    },
    levelSelect: {
        title: '关卡选择',
        locked: '未解锁',
        camp: '营地',
        clearCount: (count: number) => `通关 ${count} 次`,
        replayTier: (tier: number) => `重玩 ${tier} 档`,
        coinPercent: (percent: number) => `金币收益 ${percent}%`,
        enemyHpPercent: (percent: number) => `敌人生命 ${percent}%`,
        replayHint: '每次成功通关后，下次进入该关提升一档，最高 3 档。金币收益依次为 100% / 65% / 40% / 25%，最低 25%。死亡或续关不加档；同轮重复击杀不重复领取金币。敌人生命包含章节与 Boss 各自的强度调整。',
        back: '返回主菜单',
        sceneNames: ['森林遗迹', '地下洞窟', '天空神殿'] as string[]
    },
    pause: {
        title: '已暂停',
        resume: '继续',
        settings: '设置',
        help: '操作说明',
        saveQuit: '保存并退出',
        saves: '查看 / 导出存档',
        abandon: '放弃本关',
        abandonHint: '返回关卡选择；已获金币和永久收集保留，重玩从关卡起点开始'
    },
    result: {
        cleared: '关卡完成',
        time: '用时',
        kills: '击杀',
        shards: '回响碎片',
        coins: '当前钱包',
        earnedCoins: '本关获得金币',
        firstClearCoins: '首通奖励',
        lostCoins: '死亡损失',
        newRecord: '新纪录',
        next: '下一关',
        retry: '重试',
        back: '返回关卡选择'
    },
    victory: {
        title: '深渊已息', subtitle: '晨光，终于抵达。', game: '深渊回响',
        story: '你穿过林间遗迹，深入幽暗洞窟，最终让回响归于宁静。',
        thanks: '每一次跃起，每一次重来，都让你走到了这里。',
        journey: '走过的旅途', completed: '三章冒险已完成',
        chapterNames: ['森林遗迹', '地下洞窟', '天空神殿'],
        chapterNotes: ['穿过藤蔓与断垣', '点亮深处的微光', '在云端终结回响'],
        bosses: ['石像守卫者', '深渊蛛后', '回响之影'], defeated: '已击败',
        levels: '完成关卡', shards: '回响碎片', chests: '已开启宝箱', time: '累计游玩',
        completeEcho: '完整回响', echoHint: '全部回响碎片已寻回', badge: '破晓行者',
        saveScope: '本存档累计 · 包含重试与重玩', details: '冒险记录',
        kills: '累计击杀', deaths: '累计死亡', coins: '剩余金币', best: '最终关最佳用时',
        finalTime: '本次最终关用时', equipment: '此刻的装备', emptyHand: '未装备',
        main: '主手', sub: '副手', camp: '返回营地', revisit: '重访关卡', menu: '返回标题',
        replay: '重看结局', skip: '跳过演出', pending: '待领取战利品', claim: '领取',
        pendingHint: '背包装不下的战利品已保存在存档中，腾出空间后可在此领取。',
        inventory: '整理背包', noBest: '暂无记录'
    },
    save: {
        title: '存档管理', current: '当前存档', preview: '待导入存档',
        level: '关卡', checkpoint: '检查点', savedAt: '保存时间', playTime: '累计游玩',
        noSave: '尚无已保存的进度。进入关卡后可在暂停菜单保存并退出。',
        noLevel: '营地 / 待出发', spawn: '关卡出生点', unknownTime: '时间未知',
        duration: (seconds: number) => `${Math.floor(seconds / 3600)} 小时 ${Math.floor(seconds % 3600 / 60)} 分 ${Math.floor(seconds % 60)} 秒`,
        export: '导出 JSON', select: '选择 JSON 存档', replace: '导入并替换当前存档',
        importWarning: '导入会替换当前进度、背包、技能、设置和纪录。建议先导出备份。',
        importMenuOnly: '为避免覆盖正在游玩的状态，请返回主菜单后导入。',
        imported: '存档已导入并保存，可以继续游戏。', readFailed: '无法读取此文件，请重新选择。',
        invalid: '存档格式或校验不正确，未导入。', newer: '存档来自较新版本，当前版本无法导入。',
        migrationFailed: '存档版本转换失败，未导入。',
        failedQuota: '保存失败：本地存储空间不足。当前进度仅在内存中，请重试或导出备份。',
        failedUnavailable: '保存失败：浏览器本地存储不可用。当前进度仅在内存中，请重试或导出备份。',
        retry: '重试保存', written: '进度已保存', exported: '已发起 JSON 下载，请保管好备份。',
        close: '关闭', dismiss: '收起提示'
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
    camp: {
        regions: {
            1: { title: '林间余火', subtitle: '森林遗迹营地', description: '树影守住这片空地，远行前记得补足行囊。' },
            2: { title: '晶光驿站', subtitle: '地下水晶洞营地', description: '循着晶簇的微光，在岩层深处稍作停留。' },
            3: { title: '云上栖所', subtitle: '天空神殿营地', description: '风穿过残柱，回响之门等待下一次启程。' }
        },
        merchant: '旅行商人',
        merchantDetail: '药水 · 弹药 · 武器强化',
        portal: '回响之门',
        portalDetail: '选择关卡，继续冒险',
        trade: '交易与补给',
        depart: '前往关卡选择',
        choose: '切换设施',
        confirm: '确认',
        mouseHint: '也可直接点击摊位或传送门',
        pauseHint: 'Esc 暂停',
        fireNote: '余火未熄，旅途仍在继续'
    },
    inventory: {
        chooseHand: '已选中武器，请点击装主手或装副手。',
        ammoRule: '箭矢供轻弩、火杖使用；飞镖供飞镖枪使用。弹药不会自动互换，购买武器后需在背包装备。飞镖枪在第 2 区域营地解锁。',
        ammoHint: '这是弹药，请返回关卡，用装备的远程武器攻击；初始轻弩按 K / 鼠标右键射击。',
        controls: '左键使用药水 ｜ 右键装主手 ｜ 双击装副手',
        ammoNote: '弹药由远程武器消耗，点击弹药不会投掷。'
    }
} as const;
