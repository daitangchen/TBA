/*!
 * TBA 模拟器 · 数据层
 * 数据来源：
 *   - 球员信息表.et（22 名球员 + 6 位老师）
 *   - schedule.md（2025.7.2 - 2026.6.9 的赛历与打球日规则）
 *   - rules.png（建队核心 / 选秀 / 交易市场规则）
 */
(function (global) {
  'use strict';
  const TBA = (global.TBA = global.TBA || {});

  TBA.VERSION = '1.0.0';
  TBA.TITLE = 'TBA 模拟器';

  /* ============================================================
   * 一、赛历（来自 schedule.md）
   * ============================================================ */
  TBA.SEASON = {
    start: '2025-07-02',
    end: '2026-06-09',
    periods: [
      { kind: 'stay', label: '暑假留校', start: '2025-07-02', end: '2025-07-11' },
      { kind: 'vacation', label: '暑假', start: '2025-07-12', end: '2025-08-10' },
      { kind: 'stay', label: '暑假留校', start: '2025-08-11', end: '2025-08-30' },
      { kind: 'school', label: '正常上学', start: '2025-08-31', end: '2026-02-04' },
      { kind: 'stay', label: '寒假留校', start: '2026-02-05', end: '2026-02-10' },
      { kind: 'vacation', label: '寒假', start: '2026-02-11', end: '2026-02-24' },
      { kind: 'stay', label: '寒假留校', start: '2026-02-25', end: '2026-03-01' },
      { kind: 'school', label: '正常上学', start: '2026-03-02', end: '2026-06-09' }
    ],
    // 小考试 3 天、大考试 6 天，考试期间每天都能打球
    exams: [
      { kind: 'small', label: '小考试', start: '2025-08-28', days: 3 },
      { kind: 'small', label: '小考试', start: '2025-10-04', days: 3 },
      { kind: 'small', label: '小考试', start: '2025-12-27', days: 3 },
      { kind: 'small', label: '小考试', start: '2026-03-01', days: 3 },
      { kind: 'small', label: '小考试', start: '2026-05-17', days: 3 },
      { kind: 'big', label: '大考试', start: '2025-10-30', days: 6 },
      { kind: 'big', label: '大考试', start: '2026-01-29', days: 6 },
      { kind: 'big', label: '大考试', start: '2026-03-14', days: 6 },
      { kind: 'big', label: '大考试', start: '2026-05-02', days: 6 }
    ]
  };

  // 每周的体育课（0 = 周日）
  TBA.PE_CLASS = {
    0: '周日加练',
    2: '周二 · 下午第一节',
    4: '周四 · 下午第二节',
    5: '周五 · 下午第一节'
  };

  // 留校期间可以打球的日子：周二、周四、周六（0 = 周日）
  TBA.STAY_DAYS = [2, 4, 6];

  /* ============================================================
   * 二、球员特性（来自「特性一（球场特性）」列的预留设计）
   * mods 在比赛模拟中生效，均为乘法系数或加法修正
   * ============================================================ */
  TBA.TRAITS = {
    '场上教练': { desc: '球队大脑：助攻 +25%，全队命中 +2%', mods: { ast: 1.25, teamShot: 0.02 } },
    '内线绞肉机': { desc: '低位重锤：篮板 +15%，篮下命中 +10%，速度 -5%', mods: { reb: 1.15, inside: 0.10, spd: 0.95 } },
    '全能锋线': { desc: '攻防一体：投篮、篮板、防守 +5%', mods: { shot: 1.05, reb: 1.05, def: 1.05 } },
    '硬核蓝领': { desc: '对抗凶狠：防守 +12%，力量 +5%', mods: { def: 1.12, str: 1.05 } },
    '长臂守卫': { desc: '死亡缠绕：防守 +10%，篮板 +5%', mods: { def: 1.10, reb: 1.05 } },
    '稳健组织': { desc: '控场大师：助攻 +20%，失误更少', mods: { ast: 1.20 } },
    '铁血防守': { desc: '防守大闸：防守 +15%', mods: { def: 1.15 } },
    '快攻箭头': { desc: '风驰电掣：速度 +10%，快攻加成', mods: { spd: 1.10 } },
    '中距离刺客': { desc: '中投稳如狗：投篮 +8%', mods: { shot: 1.08 } },
    '高塔后卫': { desc: '错位优势：投篮 +6%，篮板 +8%', mods: { shot: 1.06, reb: 1.08 } },
    '拼命三郎': { desc: '不知疲倦：防守 +8%，体力 +5%', mods: { def: 1.08, sta: 1.05 } },
    '电光石火': { desc: '速度 +12%', mods: { spd: 1.12 } },
    '底角炮台': { desc: '三分 +10%', mods: { three: 1.10 } },
    '无球跑动': { desc: '跑出空位：投篮 +5%', mods: { shot: 1.05 } },
    '蓝领干将': { desc: '干脏活：篮板 +8%，防守 +5%', mods: { reb: 1.08, def: 1.05 } },
    '重型坦克': { desc: '碾进去：力量 +10%，篮板 +5%，速度 -8%', mods: { str: 1.10, reb: 1.05, spd: 0.92 } },
    '死神三分': { desc: '超远射程：三分 +15%，投篮 +3%', mods: { three: 1.15, shot: 1.03 } },
    '客串奇兵': { desc: '偶尔来一场神迹：发挥波动更大', mods: { variance: 1.35 } }
  };

  /* ============================================================
   * 三、球员名单（球员信息表.et）
   * pos 为空则按身高体重自动判定
   * ============================================================ */
  TBA.ROSTER = [
    { id: 1, name: '大娘', role: '总经理', pos: '锋线', h: 185, w: 100, core: true, trait: '场上教练' },
    { id: 2, name: '奶龙', role: '领袖', pos: '锋线', h: 190, w: 120, core: true, trait: '内线绞肉机' },
    { id: 3, name: '走刀', role: '领袖', pos: '锋线', h: 190, w: 90, core: true, trait: '全能锋线' },
    { id: 4, name: '捞软', role: '常驻球员', pos: '后卫', h: 175, w: 75, trait: '硬核蓝领' },
    { id: 5, name: '毛毛', role: '常驻球员', pos: '后卫', h: 182, w: 65, trait: '长臂守卫' },
    { id: 6, name: '老爹', role: '常驻球员', pos: '后卫', h: 175, w: 60, trait: '稳健组织' },
    { id: 7, name: '思装', role: '常驻球员', pos: '后卫', h: 180, w: 60, trait: '铁血防守' },
    { id: 8, name: '哈碧', role: '常驻球员', pos: '后卫', h: 180, w: 60, trait: '快攻箭头' },
    { id: 9, name: '撒嘛', role: '常驻球员', pos: '后卫', h: 180, w: 65, trait: '中距离刺客' },
    { id: 10, name: '男神', role: '常驻球员', pos: '后卫', h: 185, w: 60, trait: '高塔后卫' },
    { id: 11, name: '皮炎', role: '常驻球员', pos: '后卫', h: 175, w: 60, trait: '拼命三郎' },
    { id: 12, name: '麦克', role: '常驻球员', pos: '后卫', h: 170, w: 55, trait: '电光石火' },
    { id: 13, name: '圆度', role: '常驻球员', pos: '后卫', h: 175, w: 55, trait: '底角炮台' },
    { id: 14, name: '园林', role: '常驻球员', pos: '后卫', h: 175, w: 55, trait: '无球跑动' },
    { id: 15, name: '张嘎', role: '常驻球员', pos: '锋线', h: 185, w: 75, trait: '蓝领干将' },
    { id: 16, name: '路观', role: '常驻球员', pos: '锋线', h: 190, w: 95, trait: '重型坦克' },
    { id: 17, name: '枪王', role: '常驻球员', pos: '锋线', h: 185, w: 55, trait: '死神三分' },
    { id: 18, name: '王总', role: '客串球员', pos: '', h: 185, w: 55, trait: '客串奇兵' },
    { id: 19, name: '鸟哥', role: '客串球员', pos: '', h: 175, w: 55, trait: '客串奇兵' },
    { id: 20, name: '鱼钩', role: '客串球员', pos: '', h: 180, w: 60, trait: '客串奇兵' },
    { id: 21, name: '队长', role: '客串球员', pos: '', h: 175, w: 65, trait: '客串奇兵' },
    { id: 22, name: '牢胥', role: '客串球员', pos: '', h: 180, w: 55, trait: '客串奇兵' }
  ];

  /* 老师：球队之外的 NPC，用来触发生活事件 */
  TBA.TEACHERS = [
    { name: '秦始皇', role: '班主任 / 生物老师' },
    { name: '特老师', role: '语文老师' },
    { name: '嘴老师', role: '数学老师' },
    { name: '彤老师', role: '英语老师' },
    { name: '搓老师', role: '物理老师' },
    { name: '猫老师', role: '化学老师' }
  ];

  /* ============================================================
   * 四、日常事件（校园生活味）
   * ============================================================ */
  TBA.EVENTS = [
    { id: 'ev1', title: '秦始皇拖堂', text: '班主任秦始皇把最后一节课拖了十分钟，你们冲向球场时，隔壁班已经开打了。', effects: [] },
    { id: 'ev2', title: '嘴老师加课', text: '数学老师嘴老师临时加了一节自习，你们在课桌底下用橡皮擦推演挡拆，全队投篮 +1。', effects: [{ type: 'attr', attr: 'shot', value: 1 }] },
    { id: 'ev3', title: '特老师送水', text: '语文老师特老师路过球场，顺手给全队买了冰水，体力 +10。', effects: [{ type: 'stamina', value: 10 }] },
    { id: 'ev4', title: '猫老师的实验室', text: '化学实验室飘来奇怪的气味，全队头晕眼花，体力 -6。', effects: [{ type: 'stamina', value: -6 }] },
    { id: 'ev5', title: '手感之夜', text: '今天的篮筐像大海一样宽，下一场比赛全队手感火热。', effects: [{ type: 'buff', key: 'hotHand' }] },
    { id: 'ev6', title: '彤老师查作业', text: '英语老师彤老师突击检查单词，全队被罚抄，体力 -4。', effects: [{ type: 'stamina', value: -4 }] },
    { id: 'ev7', title: '搓老师的物理课', text: '物理老师搓老师讲了角动量守恒，你们突然理解了投篮的抛物线，全队投篮 +1。', effects: [{ type: 'attr', attr: 'shot', value: 1 }] },
    { id: 'ev8', title: '空场', text: '球场上一个人都没有，你们练了一下午基本功，全队体能 +1。', effects: [{ type: 'attr', attr: 'sta', value: 1 }] },
    { id: 'ev9', title: '转学生的球鞋', text: '一位转学生留下了一双旧球鞋，队里最能跳的人试了试，速度 +1。', effects: [{ type: 'attr', attr: 'spd', value: 1 }] },
    { id: 'ev10', title: '食堂加餐', text: '食堂今天有红烧肉，全队体力 +8。', effects: [{ type: 'stamina', value: 8 }] }
  ];

  /* ============================================================
   * 五、全局配置
   * ============================================================ */
  TBA.CONFIG = {
    lineupSize: 3,           // 3v3
    winScore: 21,            // 先到 21 分且领先 2 分
    maxPossessions: 240,     // 安全上限
    draftRounds: 4,          // 每队 4 个签位（第一至第四顺位）
    secondDraftDate: '2026-02-05',
    staminaStart: 100,
    staminaRest: 16,         // 每天恢复
    staminaTrain: 8,         // 训练消耗
    staminaMatch: 20,        // 一场比赛的主力消耗
    injuryThreshold: 28,
    injuryChance: 0.10,
    eventChance: 0.22,
    aiMatchChance: 0.45      // 可打球日 AI 互打的概率
  };

  /* 选秀顺序：ABC ABC BCA CAB（见 rules.png 图一底部） */
  TBA.DRAFT_ORDER = ['A', 'B', 'C', 'A', 'B', 'C', 'B', 'C', 'A', 'C', 'A', 'B'];

  /* 批次参考表（rules.png 表格，用于界面展示） */
  TBA.DRAFT_TABLE = {
    A: [1, 2, 2, 3],
    B: [2, 1, 3, 2],
    C: [3, 3, 1, 1]
  };
})(typeof window !== 'undefined' ? window : globalThis);
