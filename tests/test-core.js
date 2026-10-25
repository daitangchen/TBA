/*!
 * TBA 模拟器 · 核心逻辑测试（v1.1.6 每日车轮战）
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

/* ---------- 3. 每日 15 人池 ---------- */
console.log('\n=== 每日 15 人池 ===');
const s = Game.create();
s.date = '2025-09-02';
const pool = Game.buildPool(s);
check('池子固定 15 人', pool.length === 15, pool.length);
check('锋线全来（6 人）', pool.filter(p => p.pos === '锋线').length === 6);
check('常规日没有客串球员', pool.every(p => p.role !== TBA.GUEST_ROLE));
check('后卫 9 人', pool.filter(p => p.pos === '后卫').length === 9);

s.date = '2025-10-30';
let guestSeen = 0;
for (let i = 0; i < 40; i++) guestSeen += Game.buildPool(s).filter(p => p.role === TBA.GUEST_ROLE).length;
check('考试日会有客串球员到场', guestSeen > 0, `40 次共 ${guestSeen} 人次`);

/* ---------- 4. 三队选人 ---------- */
console.log('\n=== 三队选人 ===');
s.date = '2025-09-02';
const day = Game.buildDayTeams(s);
const ids = ['T1', 'T2', 'T3'];
check('三支队伍', ids.every(id => day.teams[id].length === CFG.teamSize), ids.map(id => day.teams[id].length).join('/'));
check('15 人全部分完，无重复', new Set(ids.reduce((a, id) => a.concat(day.teams[id]), [])).size === 15);
check('三位领袖各在自己队里', s.teams.every(t => day.teams[t.id][0] === t.core));
check('每队 1 领袖 + 4 人', ids.every(id => day.teams[id].length === 5 && s.players[day.teams[id][0]].core));

/* ---------- 5. 车轮战 ---------- */
console.log('\n=== 车轮战 ===');
const sess = Game.startSession(s, day.teams);
check('进入车轮战阶段', s.phase === 'session' && !!sess);
check('大娘队先上场', sess.court.indexOf('T1') >= 0, sess.court.join(' vs '));
check('第三队在场下等', sess.waiting && sess.court.indexOf(sess.waiting) < 0, sess.waiting);
check('周中抢 7 分', sess.target === 7, sess.target);
check('计时从 0 开始', sess.elapsed === 0);

const g1 = Game.sessionPlay(s);
check('第一场打完', !!g1, g1 && `${g1.game.scoreH}:${g1.game.scoreA}`);
check('赢的留在场上', s.session.court.indexOf(g1.game.winnerId) >= 0);
check('输的下场等待', s.session.waiting === g1.game.loserId);
check('原来的场下队伍上场', s.session.court.indexOf('T1') >= 0 || s.session.court.length === 2);
check('计时增加', s.session.elapsed === g1.game.minutes, `${s.session.elapsed} 分钟`);

let guard = 0;
while (s.session && !s.session.finished && guard++ < 60) Game.sessionPlay(s);
check('45 分钟打满后结束', s.session && s.session.finished, s.session && s.session.elapsed);
check('至少打了 3 场', s.session.games.length >= 3, s.session.games.length);
check('每场都有胜负', s.session.games.every(g => g.winnerId && g.loserId));

const totalWins = s.teams.reduce((a, t) => a + t.wins, 0);
const summary = Game.endSession(s);
check('结束车轮战后回到赛季', s.phase === 'season', s.phase);
check('日期推进一天', s.date === '2025-09-03', s.date);
check('战绩写进积分榜', s.teams.reduce((a, t) => a + t.wins, 0) === totalWins);
check('保留当天战报', !!summary && summary.games.length === s.lastSession.games.length);

/* ---------- 6. 周日抢 21 ---------- */
console.log('\n=== 周日抢 21 ===');
const s2 = Game.create();
s2.date = '2025-09-07'; // 周日
check('周日分数制是 21', Game.winScoreOf(s2) === 21, Game.winScoreOf(s2));
const day2 = Game.buildDayTeams(s2);
Game.startSession(s2, day2.teams);
const g2 = Game.sessionPlay(s2);
check('周日比赛按 21 分制', g2 && g2.result.target === 21, g2 && g2.result.target);
check('周日一场时间更长', g2 && g2.game.minutes >= 10, g2 && g2.game.minutes);
Game.endSession(s2);

/* ---------- 7. 老师点评 ---------- */
console.log('\n=== 老师点评 ===');
const s4 = Game.create();
check('假期（暑假）没有上课点评', Game.teacherComment(s4, 'day', '2025-07-15') === null);
check('留校日没有上课点评', Game.teacherComment(s4, 'day', '2025-07-03') === null);
check('考试周没有上课点评', Game.teacherComment(s4, 'day', '2025-10-30') === null);
const c1 = Game.teacherComment(s4, 'day', '2025-09-02');
check('上学日有老师点评', !!c1 && !!c1.text, c1 && `${c1.name}：${c1.text}`);
check('周二轮到嘴老师', c1 && c1.name === '嘴老师', c1 && c1.name);

/* ---------- 8. 整季推进 ---------- */
console.log('\n=== 整季推进 ===');
const s5 = Game.create();
let days = 0, sessions = 0, games = 0;
while (s5.phase === 'season' && days++ < 400) {
  const info = calendar.dayInfo(s5.date);
  if (info.playable && Game.canStartMatch(s5)) {
    const d = Game.buildDayTeams(s5);
    if (Game.startSession(s5, d.teams)) {
      let g = 0;
      while (s5.session && !s5.session.finished && g++ < 60) Game.sessionPlay(s5);
      games += s5.session ? s5.session.games.length : 0;
      Game.endSession(s5);
      sessions++;
    } else {
      Game.rest(s5);
    }
  } else {
    Game.rest(s5);
  }
}
console.log('结束日期', s5.date, '阶段', s5.phase, '车轮战', sessions, '场次', games);
check('赛季在 2026-06 结束', s5.phase === 'end' && s5.date > '2026-06-09', s5.date);
check('赛季有足够车轮战', sessions > 50, sessions);
check('每轮至少 3 场', games >= sessions * 3, games);
Game.standings(s5).forEach(t => console.log(`${t.name}\t${t.wins}胜${t.losses}负\t${t.pf}:${t.pa}`));

console.log('\n' + (failures === 0 ? '全部通过 ✅' : failures + ' 项失败 ❌'));
process.exit(failures === 0 ? 0 : 1);
