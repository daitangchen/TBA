/*!
 * TBA 模拟器 · 核心逻辑测试（v1.1.5 每场 15 人池）
 * 运行：node tests/test-core.js
 */
const path = require('path');
require(path.join(__dirname, '..', 'assets', 'js', 'data.js'));
require(path.join(__dirname, '..', 'assets', 'js', 'core.js'));

const TBA = globalThis.TBA;
const { calendar, game: Game } = TBA;
const CFG = TBA.CONFIG;

let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? '  ' + extra : ''));
  if (!cond) failures++;
}

function autoRosters(st, oppId) {
  const setup = Game.buildMatchSetup(st, 'T1', oppId);
  if (!setup) return null;
  const out = {};
  out.T1 = setup.rosters.H;
  out[oppId] = setup.rosters.A;
  return out;
}

/* ---------- 1. 赛历 ---------- */
const cases = [
  ['2025-07-02', false, '留校周三'],
  ['2025-07-03', true, '留校周四'],
  ['2025-07-11', false, '留校最后一天'],
  ['2025-07-12', false, '暑假'],
  ['2025-08-28', true, '小考试'],
  ['2025-08-30', true, '小考试 + 留校最后一天（考试优先）'],
  ['2025-09-02', true, '周二体育课'],
  ['2025-09-07', true, '周日体育课'],
  ['2025-09-08', false, '周一'],
  ['2025-10-31', true, '大考试'],
  ['2026-02-04', false, '寒假留校前一天'],
  ['2026-02-05', true, '寒假留校周四'],
  ['2026-02-10', false, '寒假留校最后一天'],
  ['2026-03-01', true, '小考试'],
  ['2026-06-09', true, '赛季最后一天（周二）']
];
console.log('\n=== 赛历（schedule.md） ===');
cases.forEach(([d, want, note]) => {
  const info = calendar.dayInfo(d);
  check(`${d} playable=${info.playable} (${note})`, info.playable === want, info.reason);
});

/* ---------- 2. 球员 ---------- */
console.log('\n=== 球员（球员信息表.et） ===');
const players0 = TBA.engine.buildPlayers();
const list = Object.values(players0).sort((a, b) => b.overall - a.overall);
check('球员数量 22', list.length === 22, list.length);
check('建队核心 3 人', list.filter(p => p.core).length === 3);
check('锋线 6 人', list.filter(p => p.pos === '锋线').length === 6);
check('后卫 11 人 + 客串 5 人', list.filter(p => p.role === '常驻球员' && p.pos === '后卫').length === 11 && list.filter(p => p.role === '客串球员').length === 5);

/* ---------- 3. 每场 15 人池 ---------- */
console.log('\n=== 每场 15 人池 ===');
const s = Game.create();
check('开局直接进入赛季（不再有固定阵容选秀）', s.phase === 'season', s.phase);
s.date = '2025-09-02'; // 正常上学日
const pool = Game.buildPool(s);
check('池子固定 15 人', pool.length === 15, pool.length);
check('锋线全来（6 人）', pool.filter(p => p.pos === '锋线').length === 6);
check('三位领袖都在池子里', [1, 2, 3].every(id => pool.some(p => p.id === id)));
check('常规日没有客串球员', pool.every(p => p.role !== TBA.GUEST_ROLE));
check('后卫 9 人', pool.filter(p => p.pos === '后卫').length === 9);

// 考试日：客串球员可能出现，但总数仍是 15
s.date = '2025-10-30'; // 大考试
let guestSeen = 0;
for (let i = 0; i < 40; i++) {
  const p = Game.buildPool(s);
  if (p.length !== 15) { check('考试日池子仍是 15 人', false, p.length); break; }
  guestSeen += p.filter(x => x.role === TBA.GUEST_ROLE).length;
}
check('考试日会有客串球员到场', guestSeen > 0, `40 次共出现 ${guestSeen} 人次`);
check('考试日锋线仍然全来', Game.buildPool(s).filter(p => p.pos === '锋线').length === 6);

// 连续 30 次常规池：后卫组合会变
s.date = '2025-09-02';
const combos = new Set();
for (let i = 0; i < 30; i++) combos.add(Game.buildPool(s).map(p => p.id).sort().join(','));
check('常规日的池子每次不一样（后卫随机）', combos.size > 1, `${combos.size} 种组合`);

/* ---------- 4. 赛前组队 ---------- */
console.log('\n=== 赛前组队 ===');
s.date = '2025-09-02';
const setup = Game.buildMatchSetup(s, 'T1', 'T2');
check('组队结果两边的名单', !!setup && setup.rosters.H.length === 6 && setup.rosters.A.length === 6,
  setup && `${setup.rosters.H.length} / ${setup.rosters.A.length}`);
check('两边领袖各自在队里', setup.rosters.H.indexOf(1) >= 0 && setup.rosters.A.indexOf(2) >= 0);
check('两边没有重复球员', setup.rosters.H.every(id => setup.rosters.A.indexOf(id) < 0));
check('每队 5 名选秀 + 1 名领袖', setup.rosters.H.length === CFG.picksPerTeam + 1);

const rosters = autoRosters(s, 'T2');
const r1 = Game.playMatch(s, 'T2', rosters);
check('临时阵容可以开赛', !!r1, r1 && `${r1.scoreH}:${r1.scoreA}`);
check('比赛记录首发 3 人', !!r1 && r1.lineupH.length === 3, r1 && r1.lineupH.join(','));
check('赛后记住上一场阵容', s.lastTeam.length === 6, s.lastTeam.length);

// 非法名单
const bad = { T1: rosters.T1.slice(0, 5), T2: rosters.T2.slice() };
check('人数不足不能开赛', Game.playMatch(s, 'T2', bad) === null);
const dup = { T1: rosters.T1.slice(), T2: rosters.T2.slice() };
dup.T2[1] = dup.T1[1];
check('重复球员不能开赛', Game.playMatch(s, 'T2', dup) === null);

const s2 = Game.create();
s2.date = '2025-09-02';
const rosters2 = autoRosters(s2, 'T2');
s2.players[rosters2.T1[1]].injury = 2;
check('伤员不能出现在名单里', Game.playMatch(s2, 'T2', rosters2) === null);

/* ---------- 5. 训练 / 事件 ---------- */
console.log('\n=== 训练与事件 ===');
const s3 = Game.create();
s3.date = '2025-09-02';
const before = Object.values(s3.players).map(p => p.attrs.shot);
Game.train(s3, 'shot');
const after = Object.values(s3.players).map(p => p.attrs.shot);
check('全班加练提升所有人', after.every((v, i) => v >= before[i]), `${before.slice(0, 3)} -> ${after.slice(0, 3)}`);

/* ---------- 6. 老师点评 ---------- */
console.log('\n=== 老师点评 ===');
const s4 = Game.create();
check('假期（暑假）没有上课点评', Game.teacherComment(s4, 'day', '2025-07-15') === null);
check('留校日没有上课点评', Game.teacherComment(s4, 'day', '2025-07-03') === null);
check('考试周没有上课点评', Game.teacherComment(s4, 'day', '2025-10-30') === null);
const c1 = Game.teacherComment(s4, 'day', '2025-09-02');
check('上学日有老师点评', !!c1 && !!c1.text, c1 && `${c1.name}：${c1.text}`);
check('同一天点评稳定', !!c1 && c1.text === Game.teacherComment(s4, 'day', '2025-09-02').text);
check('周二轮到嘴老师', c1 && c1.name === '嘴老师', c1 && c1.name);
const cWin = Game.teacherComment(s4, 'win', '2025-09-02');
const cLose = Game.teacherComment(s4, 'lose', '2025-09-02');
check('赛后输赢点评不同', !!cWin && !!cLose && cWin.text !== cLose.text);

/* ---------- 7. 整季推进 ---------- */
console.log('\n=== 整季推进 ===');
const s5 = Game.create();
let days = 0, matches = 0;
while (s5.phase === 'season' && days++ < 400) {
  const info = calendar.dayInfo(s5.date);
  const opps = Game.playableOpponents(s5);
  if (info.playable && opps.length && Game.canStartMatch(s5)) {
    const rs = autoRosters(s5, opps[0].id);
    if (rs && Game.playMatch(s5, opps[0].id, rs)) matches++;
    else Game.rest(s5);
  } else {
    Game.rest(s5);
  }
}
console.log('结束日期', s5.date, '阶段', s5.phase, '比赛', matches);
check('赛季在 2026-06 结束', s5.phase === 'end' && s5.date > '2026-06-09', s5.date);
check('赛季有足够比赛', matches > 60, matches);
Game.standings(s5).forEach(t => console.log(`${t.name}\t${t.wins}胜${t.losses}负\t${t.pf}:${t.pa}`));
const totalGames = s5.teams.reduce((a, t) => a + t.wins + t.losses, 0) / 2;
check('总场次与战绩一致', Number.isInteger(totalGames) && totalGames > matches, totalGames);

console.log('\n' + (failures === 0 ? '全部通过 ✅' : failures + ' 项失败 ❌'));
process.exit(failures === 0 ? 0 : 1);
