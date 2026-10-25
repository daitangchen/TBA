/*!
 * TBA 模拟器 · 中期选秀 / 锁定规则测试
 * 运行：node tests/test-lock.js
 */
const path = require('path');
require(path.join(__dirname, '..', 'assets', 'js', 'data.js'));
require(path.join(__dirname, '..', 'assets', 'js', 'core.js'));

const TBA = globalThis.TBA;
const { game: Game, draft: Draft, calendar: Cal } = TBA;

let failures = 0;
const check = (n, c, e) => {
  console.log((c ? 'PASS ' : 'FAIL ') + n + (e !== undefined ? '  ' + e : ''));
  if (!c) failures++;
};

function autoDraft(st) {
  let g = 0;
  while (st.phase === 'draft' && g++ < 120) {
    if (st.draft.stage === 'lock') { Draft.humanLock(st, null); continue; }
    const r = Draft.step(st);
    if (r.type === 'human') {
      const best = st.draft.pool.map(id => st.players[id]).sort((a, b) => b.overall - a.overall)[0];
      Draft.humanPick(st, best.id);
    }
  }
}

const st = Game.create();
autoDraft(st);
const human = st.teams.find(t => t.human);
console.log('第一轮阵容', human.roster.map(id => st.players[id].name).join(' / '));

const r1First = st.draftHistory[0].firstPick[human.id];
console.log('第一轮第一顺位', st.players[r1First].name);

// 推进到中期选秀
let guard = 0;
while (st.phase === 'season' && guard++ < 400) {
  if (Cal.dayInfo(st.date).playable && Game.canField(st, 'T1')) Game.playMatch(st, 'T2');
  else Game.rest(st);
}
check('2026-02-05 触发中期选秀', st.phase === 'draft' && st.draft.round === 2 && st.date === '2026-02-05', st.date);

const d = st.draft;
check('进入锁定阶段', d.stage === 'lock');
const allowed = d.previous.rosterAfter[human.id].filter(id => id !== d.previous.firstPick[human.id]);
check('可锁定 4 人（不含上一轮第一顺位）', allowed.length === 4, allowed.length);

const lockId = allowed[0];
console.log('锁定', st.players[lockId].name, '| 批次', JSON.stringify(d.batches));
check('锁定成功', Draft.humanLock(st, lockId) === true);
check('锁定球员已从池中移除', d.pool.indexOf(lockId) < 0);

autoDraft(st);
check('中期选秀完成', st.phase === 'season', st.phase);
check('锁定球员留在自己队里', human.roster.indexOf(lockId) >= 0, human.roster.map(id => st.players[id].name).join(' / '));
check('其他球队没有截胡', st.teams.filter(t => !t.human).every(t => t.roster.indexOf(lockId) < 0));
check('锁定球员成为本轮第一顺位', st.draftHistory[1].firstPick[human.id] === lockId);

// 批次按战绩分配：输得最多的拿 A 批
console.log('中期选秀批次', JSON.stringify(d.batches), '| 中期选秀前战绩',
  st.teams.map(t => `${t.name} ${t.wins}-${t.losses}`).join('，'));

console.log('\n' + (failures === 0 ? '全部通过 ✅' : failures + ' 项失败 ❌'));
process.exit(failures === 0 ? 0 : 1);
