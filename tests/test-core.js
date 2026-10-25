/*!
 * TBA 模拟器 · 核心逻辑测试
 * 运行：node tests/test-core.js
 */
const path = require('path');
require(path.join(__dirname, '..', 'assets', 'js', 'data.js'));
require(path.join(__dirname, '..', 'assets', 'js', 'core.js'));

const TBA = globalThis.TBA;
const { calendar, game: Game, draft: Draft } = TBA;

let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? '  ' + extra : ''));
  if (!cond) failures++;
}

function quickDraft(s) {
  let guard = 0;
  while (s.phase === 'draft' && guard++ < 120) {
    if (s.draft.stage === 'lock') { Draft.humanLock(s, null); continue; }
    const r = Draft.step(s);
    if (r.type === 'human') {
      const best = s.draft.pool.map(id => s.players[id]).sort((a, b) => b.overall - a.overall)[0];
      Draft.humanPick(s, best.id);
    }
  }
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
const players = TBA.engine.buildPlayers();
const list = Object.values(players).sort((a, b) => b.overall - a.overall);
list.forEach(p => console.log(`${p.name}\t${p.pos}\t${p.h}cm ${p.w}kg\t综合 ${p.overall}\t${p.trait}`));
check('球员数量 22', list.length === 22, list.length);
check('建队核心 3 人', list.filter(p => p.core).length === 3);

/* ---------- 3. 选秀 ---------- */
console.log('\n=== 选秀（rules.png） ===');
const state = Game.create();
check('选秀顺序 12 签', state.draft.seq.length === 12, state.draft.seq.join(''));
check('选秀顺序符合 ABC ABC BCA CAB', state.draft.seq.map(t => Draft.batchOfTeam(state.draft, t)).join('') === TBA.DRAFT_ORDER.join(''));
quickDraft(state);
check('选秀完成进入赛季', state.phase === 'season', state.phase);
state.teams.forEach(t => {
  console.log(`${t.name}: ${t.roster.map(id => players[id].name + '(' + players[id].overall + ')').join(' / ')}`);
  check(`${t.name} 阵容 6 人（核心 + 5 新秀）`, t.roster.length === 6, t.roster.length);
});

const bonus = state.draftHistory[0].bonus || [];
check('每队随机补位 1 人（共 3 人）', bonus.length === 3, bonus.length);
check('剩余自由球员 4 人', state.freeAgents.length === 4, state.freeAgents.length);
check('补位球员都在各自球队里', bonus.every(b => state.teams.find(t => t.id === b.teamId).roster.indexOf(b.playerId) >= 0));

/* ---------- 4. 比赛模拟 ---------- */
console.log('\n=== 比赛模拟（30 场） ===');
const scores = [];
for (let i = 0; i < 30; i++) {
  const s = Game.create();
  quickDraft(s);
  const res = Game.playMatch(s, 'T2');
  if (res) scores.push([res.scoreH, res.scoreA]);
}
console.log(scores.map(s => s.join(':')).join('  '));
const avgH = scores.reduce((a, s) => a + s[0], 0) / scores.length;
const avgA = scores.reduce((a, s) => a + s[1], 0) / scores.length;
const minScore = Math.min(...scores.flat());
check('比分下限合理（>= 5）', minScore >= 5, 'min ' + minScore);
check('平均总得分 28 - 50', avgH + avgA >= 28 && avgH + avgA <= 50, `avg ${avgH.toFixed(1)}:${avgA.toFixed(1)}`);
check('胜负有区分（30 场中双方都赢过）', scores.some(s => s[0] > s[1]) && scores.some(s => s[1] > s[0]));

/* ---------- 5. 整季推进 ---------- */
console.log('\n=== 整季推进 ===');
const s3 = Game.create();
quickDraft(s3);
let days = 0, drafts = 0, matches = 0;
while (s3.phase === 'season' && days++ < 400) {
  const info = calendar.dayInfo(s3.date);
  const opps = Game.playableOpponents(s3);
  if (info.playable && Game.canField(s3, 'T1') && opps.length) { Game.playMatch(s3, opps[0].id); matches++; }
  else Game.rest(s3);
  if (s3.phase === 'draft') { drafts++; quickDraft(s3); }
}
console.log('结束日期', s3.date, '阶段', s3.phase, '比赛', matches, '中期选秀', drafts);
check('赛季在 2026-06 结束', s3.phase === 'end' && s3.date > '2026-06-09', s3.date);
check('触发中期选秀', drafts === 1, drafts);
check('赛季有足够比赛', matches > 60, matches);
Game.standings(s3).forEach(t => console.log(`${t.name}\t${t.wins}胜${t.losses}负\t${t.pf}:${t.pa}`));

/* ---------- 6. 赛前手动选人 ---------- */
console.log('\n=== 赛前手动选人 ===');
const s4 = Game.create();
quickDraft(s4);
const humanTeam = s4.teams.find(t => t.human);
const healthy = Game.rosterPlayers(s4, humanTeam.id).filter(p => p.injury <= 0);
const ids = healthy.slice(0, 3).map(p => p.id);
check('三人首发合法', Game.checkLineup(s4, ids) === true);
check('两人首发不合法', Game.checkLineup(s4, ids.slice(0, 2)) === false);
check('四人首发不合法', Game.checkLineup(s4, ids.concat([healthy[3].id])) === false);
check('重复球员不合法', Game.checkLineup(s4, [ids[0], ids[0], ids[2]]) === false);
check('名单外球员不合法', Game.checkLineup(s4, ids.slice(0, 2).concat([99])) === false);

// 伤员不能上
const victim = healthy[0];
victim.injury = 2;
check('伤员首发不合法', Game.checkLineup(s4, [victim.id, ids[1], ids[2]]) === false);
check('带伤员开赛被拒绝', Game.playMatch(s4, 'T2', [victim.id, ids[1], ids[2]]) === null);
victim.injury = 0;

const r4 = Game.playMatch(s4, 'T2', ids);
check('手动首发开赛成功', !!r4);
check('比赛结果记录首发', !!r4 && r4.lineupH.join(',') === ids.join(','), r4 && r4.lineupH.join(','));
check('只有选中的三人有数据', !!r4 && r4.boxH.filter(x => ids.indexOf(x.id) >= 0).length === 3);

const r4b = (() => { const s = Game.create(); quickDraft(s); return { s }; })();
check('不传首发时自动排阵', (() => {
  const s = r4b.s;
  const auto = Game.playMatch(s, 'T2');
  return !!auto && Array.isArray(auto.lineupH) && auto.lineupH.length === 3;
})());

/* ---------- 7. 老师点评 ---------- */
console.log('\n=== 老师点评 ===');
const s5 = Game.create();
quickDraft(s5);
check('假期（暑假）没有上课点评', Game.teacherComment(s5, 'day', '2025-07-15') === null);
check('留校日没有上课点评', Game.teacherComment(s5, 'day', '2025-07-03') === null);
check('考试周没有上课点评', Game.teacherComment(s5, 'day', '2025-10-30') === null);
const c1 = Game.teacherComment(s5, 'day', '2025-09-02');
check('上学日有老师点评', !!c1 && !!c1.text, c1 && `${c1.name}：${c1.text}`);
check('同一天点评稳定', !!c1 && c1.text === Game.teacherComment(s5, 'day', '2025-09-02').text);
check('周二轮到嘴老师', c1 && c1.name === '嘴老师', c1 && c1.name);
const cWin = Game.teacherComment(s5, 'win', '2025-09-02');
const cLose = Game.teacherComment(s5, 'lose', '2025-09-02');
check('赛后输赢点评不同', !!cWin && !!cLose && cWin.text !== cLose.text);
Object.keys(TBA.TEACHER_LINES).forEach(name => {
  const t = TBA.TEACHER_LINES[name];
  check(`${name} 有 day/win/lose 台词`, !!(t.day && t.day.length >= 4 && t.win && t.win.length && t.lose && t.lose.length));
});

console.log('\n' + (failures === 0 ? '全部通过 ✅' : failures + ' 项失败 ❌'));
process.exit(failures === 0 ? 0 : 1);
