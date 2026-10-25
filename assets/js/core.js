/*!
 * TBA 模拟器 · 核心引擎
 * 日历 / 球员属性 / 选秀 / 3v3 比赛模拟 / 游戏状态
 */
(function (global) {
  'use strict';
  const TBA = (global.TBA = global.TBA || {});
  const CFG = TBA.CONFIG;
  const SEA = TBA.SEASON;

  /* ============================================================
   * 0. 工具
   * ============================================================ */
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const shuffle = arr => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // 由名字派生的稳定随机抖动，保证同一个球员每次生成的隐藏属性一致
  function jitter(name, salt, spread) {
    const h = hash(name + '|' + salt);
    return ((h % 2000) / 2000 - 0.5) * 2 * spread;
  }

  function weightedPick(list, weightFn) {
    if (!list.length) return null;
    const ws = list.map(weightFn);
    let total = 0;
    for (const w of ws) total += Math.max(0.0001, w);
    let r = Math.random() * total;
    for (let i = 0; i < list.length; i++) {
      r -= Math.max(0.0001, ws[i]);
      if (r <= 0) return list[i];
    }
    return list[list.length - 1];
  }

  const avg = (list, fn) => (list.length ? list.reduce((s, x) => s + fn(x), 0) / list.length : 0);

  /* ============================================================
   * 1. 日历
   * ============================================================ */
  function parseDate(s) {
    const p = String(s).split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2], 12, 0, 0);
  }
  function fmtDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }
  const addDays = (s, n) => {
    const d = parseDate(s);
    d.setDate(d.getDate() + n);
    return fmtDate(d);
  };
  const weekdayOf = s => parseDate(s).getDay();

  function findPeriod(date) {
    return SEA.periods.find(p => date >= p.start && date <= p.end) || null;
  }
  function findExam(date) {
    return SEA.exams.find(e => date >= e.start && date <= addDays(e.start, e.days - 1)) || null;
  }

  function dayInfo(date) {
    const inSeason = date >= SEA.start && date <= SEA.end;
    const weekday = weekdayOf(date);
    const period = findPeriod(date);
    const exam = findExam(date);
    let playable = false;
    let tag = '休';
    let reason = '';
    let playLabel = '';

    if (!inSeason) {
      return {
        date, inSeason, weekday, period, exam, playable: false, tag: '休',
        reason: '不在 2025.7.2 — 2026.6.9 赛季范围内', playLabel: ''
      };
    }

    if (exam) {
      const idx = Math.round((parseDate(date) - parseDate(exam.start)) / 86400000) + 1;
      playable = true;
      tag = exam.kind === 'big' ? '大考' : '小考';
      reason = `${exam.label}第 ${idx} 天 · 考试周每天都可以打球`;
      playLabel = '考试周';
    } else if (period && period.kind === 'vacation') {
      tag = '假期';
      reason = `${period.label}中 · 球场放假`;
    } else if (period && period.kind === 'stay') {
      tag = '留校';
      const isLast = date === period.end;
      if (isLast) {
        reason = `${period.label}最后一天 · 不打球`;
      } else if (TBA.STAY_DAYS.indexOf(weekday) >= 0) {
        playable = true;
        reason = `${period.label} · 周二 / 周四 / 周六打球`;
        playLabel = '留校训练日';
      } else {
        reason = `${period.label} · 今天不是打球日`;
      }
    } else {
      tag = '上学';
      playable = Object.prototype.hasOwnProperty.call(TBA.PE_CLASS, weekday);
      if (playable) {
        reason = `体育课 · ${TBA.PE_CLASS[weekday]}`;
        playLabel = '体育课';
      } else {
        reason = '正常上学 · 今天没有体育课';
      }
    }

    return { date, inSeason, weekday, period, exam, playable, tag, reason, playLabel };
  }

  function nextPlayable(date, includeToday) {
    let d = includeToday ? date : addDays(date, 1);
    for (let i = 0; i < 500; i++) {
      if (d > SEA.end) return null;
      if (dayInfo(d).playable) return d;
      d = addDays(d, 1);
    }
    return null;
  }

  const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];
  function labelDate(date) {
    const d = parseDate(date);
    return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 · 周${WEEK_CN[d.getDay()]}`;
  }

  function monthCells(ym) {
    const [y, m] = ym.split('-').map(Number);
    const first = new Date(y, m - 1, 1, 12);
    const startPad = first.getDay();
    const days = new Date(y, m, 0, 12).getDate();
    const cells = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= days; d++) {
      const ds = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push(ds);
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }

  const calendar = { parseDate, fmtDate, addDays, weekdayOf, dayInfo, nextPlayable, labelDate, monthCells, WEEK_CN };
  calendar.dayDiff = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);
  TBA.calendar = calendar;

  /* ============================================================
   * 2. 球员与属性
   * ============================================================ */
  const ATTR_KEYS = ['shot', 'three', 'reb', 'spd', 'str', 'def', 'sta'];
  const ATTR_CN = { shot: '投篮', three: '三分', reb: '篮板', spd: '速度', str: '力量', def: '防守', sta: '体能' };
  TBA.ATTR_KEYS = ATTR_KEYS;
  TBA.ATTR_CN = ATTR_CN;

  function posOf(raw) {
    if (raw.pos) return raw.pos;
    return raw.h >= 184 && raw.w >= 68 ? '锋线' : '后卫';
  }

  function makeAttrs(raw, pos) {
    const N = raw.name;
    return {
      shot: Math.round(clamp(52 + (pos === '后卫' ? 6 : 2) + jitter(N, 'shot', 10) - (raw.w - 70) * 0.12, 30, 99)),
      three: Math.round(clamp(47 + (pos === '后卫' ? 9 : 0) + jitter(N, 'three', 14), 30, 99)),
      reb: Math.round(clamp(34 + (raw.h - 170) * 1.8 + (raw.w - 55) * 0.35 + (pos === '锋线' ? 7 : 0) + jitter(N, 'reb', 6), 30, 99)),
      spd: Math.round(clamp(88 - (raw.h - 170) * 0.9 - (raw.w - 55) * 0.42 + (pos === '后卫' ? 6 : 0) + jitter(N, 'spd', 6), 30, 99)),
      str: Math.round(clamp(38 + (raw.w - 55) * 0.85 + (raw.h - 175) * 0.45 + jitter(N, 'str', 6), 30, 99)),
      def: Math.round(clamp(45 + (raw.h - 175) * 0.3 + (raw.w - 60) * 0.2 + (pos === '锋线' ? 4 : 2) + jitter(N, 'def', 8), 30, 99)),
      sta: Math.round(clamp(86 - (raw.w - 55) * 0.45 - (raw.h - 175) * 0.35 + jitter(N, 'sta', 5), 30, 99))
    };
  }

  function overallOf(p) {
    const a = p.attrs;
    const w = p.pos === '锋线'
      ? { shot: 0.28, three: 0.10, reb: 0.22, str: 0.20, def: 0.10, spd: 0.07, sta: 0.03 }
      : { shot: 0.26, three: 0.20, spd: 0.19, def: 0.14, reb: 0.08, str: 0.07, sta: 0.06 };
    let sum = 0;
    for (const k in w) sum += a[k] * w[k];
    return Math.round(sum);
  }

  function buildPlayer(raw) {
    const pos = posOf(raw);
    const attrs = makeAttrs(raw, pos);
    const trait = raw.trait && TBA.TRAITS[raw.trait] ? raw.trait : '';
    const p = {
      id: raw.id,
      name: raw.name,
      role: raw.role,
      pos,
      h: raw.h,
      w: raw.w,
      core: !!raw.core,
      trait,
      traitDesc: trait ? TBA.TRAITS[trait].desc : '',
      attrs,
      stamina: CFG.staminaStart,
      injury: 0
    };
    p.overall = overallOf(p);
    return p;
  }

  function buildPlayers() {
    const map = {};
    TBA.ROSTER.forEach(raw => { map[raw.id] = buildPlayer(raw); });
    return map;
  }

  function traitMod(p, key, dflt) {
    if (!p.trait) return dflt === undefined ? 1 : dflt;
    const m = TBA.TRAITS[p.trait].mods;
    return m[key] === undefined ? (dflt === undefined ? 1 : dflt) : m[key];
  }

  function effAttr(p, key) {
    return p.attrs[key] * traitMod(p, key, 1);
  }

  function staminaFactor(st) {
    return 0.55 + 0.45 * clamp(st, 0, 100) / 100;
  }

  /* ============================================================
   * 3. 比赛模拟（3v3，先到 21 分且领先 2 分）
   * ============================================================ */
  function healthyOf(state, team) {
    return team.roster.map(id => state.players[id]).filter(p => p && p.injury <= 0);
  }

  function chooseLineup(state, team) {
    const pool = healthyOf(state, team);
    if (pool.length < CFG.lineupSize) return null;
    const sorted = pool.slice().sort((a, b) =>
      (b.overall * staminaFactor(b.stamina)) - (a.overall * staminaFactor(a.stamina))
    );
    return sorted.slice(0, CFG.lineupSize);
  }

  function simulateMatch(state, homeId, awayId) {
    const home = state.teams.find(t => t.id === homeId);
    const away = state.teams.find(t => t.id === awayId);
    if (!home || !away) return null;

    const startH = chooseLineup(state, home);
    const startA = chooseLineup(state, away);
    if (!startH || !startA) return null;

    const side = {
      H: { team: home, lineup: startH.slice(), bench: healthyOf(state, home).filter(p => startH.indexOf(p) < 0) },
      A: { team: away, lineup: startA.slice(), bench: healthyOf(state, away).filter(p => startA.indexOf(p) < 0) }
    };

    const box = {};
    const ensure = p => (box[p.id] = box[p.id] || { id: p.id, name: p.name, teamId: null, pts: 0, reb: 0, ast: 0, poss: 0 });
    Object.keys(side).forEach(k => {
      side[k].lineup.forEach(p => { ensure(p).teamId = side[k].team.id; });
      side[k].bench.forEach(p => { ensure(p).teamId = side[k].team.id; });
    });

    let scoreH = 0, scoreA = 0, possession = 0, offense = 'H';
    const plays = [];
    const teamShotBuff = { H: state.buffs && state.buffs.hotHand ? 0.04 : 0, A: 0 };
    const tstats = {
      H: { att: 0, made: 0, tpa: 0, tpm: 0 },
      A: { att: 0, made: 0, tpa: 0, tpm: 0 }
    };

    const other = k => (k === 'H' ? 'A' : 'H');

    function rotate(k) {
      const s = side[k];
      if (!s.bench.length) return;
      const weakest = s.lineup.slice().sort((a, b) => a.stamina - b.stamina)[0];
      const best = s.bench.slice().sort((a, b) => b.stamina - a.stamina)[0];
      if (best && weakest && best.stamina > weakest.stamina + 12) {
        s.lineup[s.lineup.indexOf(weakest)] = best;
        s.bench[s.bench.indexOf(best)] = weakest;
      }
    }

    while (possession < CFG.maxPossessions) {
      if ((scoreH >= CFG.winScore || scoreA >= CFG.winScore) && Math.abs(scoreH - scoreA) >= 2) break;

      if (possession > 0 && possession % 17 === 0) { rotate('H'); rotate('A'); }

      const atkKey = offense;
      const defKey = other(offense);
      const atk = side[atkKey];
      const def = side[defKey];

      const shooter = weightedPick(atk.lineup, p =>
        (effAttr(p, 'shot') + effAttr(p, 'three') * 0.6 + effAttr(p, 'str') * 0.4) * (0.55 + 0.45 * p.stamina / 100)
      );
      const defense = avg(def.lineup, p => effAttr(p, 'def') * staminaFactor(p.stamina));

      const threeSkill = effAttr(shooter, 'three');
      const shotSkill = effAttr(shooter, 'shot');
      const strSkill = effAttr(shooter, 'str');
      const variance = traitMod(shooter, 'variance', 1);
      const wobble = (Math.random() - 0.5) * 0.10 * variance;
      const fat = staminaFactor(shooter.stamina);

      const threeRate = clamp(0.16 + (threeSkill - 55) * 0.0045, 0.08, 0.46);
      const isThree = Math.random() < threeRate;

      const base = isThree
        ? 0.265 + (threeSkill * 0.62 + shotSkill * 0.38 - defense) / 420
        : 0.455 + (shotSkill * 0.7 + strSkill * 0.3 - defense) / 380;
      // 落后太多时咬住比分，领先太多时手会松一点
      const margin = atkKey === 'H' ? scoreH - scoreA : scoreA - scoreH;
      const momentum = margin <= -8 ? 0.05 : margin >= 8 ? -0.03 : 0;
      const prob = clamp(base * fat + teamShotBuff[atkKey] + wobble + momentum, 0.15, 0.78);

      const b = box[shooter.id];
      b.poss += 1;
      tstats[atkKey].att += 1;
      if (isThree) tstats[atkKey].tpa += 1;

      if (Math.random() < prob) {
        const pts = isThree ? 3 : 2;
        b.pts += pts;
        tstats[atkKey].made += 1;
        if (isThree) tstats[atkKey].tpm += 1;
        if (atkKey === 'H') scoreH += pts; else scoreA += pts;

        // 助攻
        if (Math.random() < 0.48) {
          const mates = atk.lineup.filter(p => p.id !== shooter.id);
          if (mates.length) {
            const passer = weightedPick(mates, p => effAttr(p, 'spd') * 0.5 + effAttr(p, 'shot') * 0.5 + traitMod(p, 'ast', 1) * 10);
            box[passer.id].ast += 1;
            plays.push({ side: atkKey, text: `${passer.name} 助攻 ${shooter.name} ${isThree ? '三分' : '上篮'}命中`, score: `${scoreH}-${scoreA}` });
          } else {
            plays.push({ side: atkKey, text: `${shooter.name} ${isThree ? '三分' : '强攻'}命中`, score: `${scoreH}-${scoreA}` });
          }
        } else {
          plays.push({ side: atkKey, text: `${shooter.name} ${isThree ? '三分冷箭' : '突破得手'}`, score: `${scoreH}-${scoreA}` });
        }
      } else if (Math.random() < 0.32) {
        // 前场篮板
        const rebounder = weightedPick(atk.lineup, p => effAttr(p, 'reb'));
        box[rebounder.id].reb += 1;
        plays.push({ side: atkKey, text: `${rebounder.name} 抢下前场篮板`, score: `${scoreH}-${scoreA}` });
        possession++;
        continue; // 二次进攻，球权不变
      } else {
        const rebounder = weightedPick(def.lineup, p => effAttr(p, 'reb') * 1.1);
        box[rebounder.id].reb += 1;
        offense = defKey;
      }

      possession++;
      offense = atkKey === 'H' ? 'A' : 'H';
    }

    const totalPoss = Math.max(1, scoreH + scoreA);
    const minutesOf = p => {
      const b = box[p.id];
      return Math.max(0, Math.round((b.poss / Math.max(1, possession)) * 18));
    };

    const toRow = p => {
      const b = box[p.id];
      return { id: p.id, name: p.name, pos: p.pos, overall: p.overall, pts: b.pts, reb: b.reb, ast: b.ast, min: minutesOf(p) };
    };

    const boxRows = sideId => {
      const s = side[sideId];
      const all = s.lineup.concat(s.bench);
      return all.map(toRow).sort((a, b) => b.pts - a.pts);
    };

    const rowsH = boxRows('H');
    const rowsA = boxRows('A');
    const winnerId = scoreH > scoreA ? homeId : awayId;
    const allRows = rowsH.map(r => ({ ...r, side: 'H' })).concat(rowsA.map(r => ({ ...r, side: 'A' })));
    const mvp = allRows.slice().sort((a, b) => (b.pts + b.reb * 0.7 + b.ast * 1.2) - (a.pts + a.reb * 0.7 + a.ast * 1.2))[0];

    // 参与者（体力消耗）：主力打满，替补上场时间少
    const participants = {};
    ['H', 'A'].forEach(k => {
      side[k].lineup.forEach(p => { participants[p.id] = 1; });
      side[k].bench.forEach(p => { participants[p.id] = 0.28; });
    });

    return {
      date: state.date,
      homeId, awayId,
      scoreH, scoreA,
      winnerId, loserId: scoreH > scoreA ? awayId : homeId,
      boxH: rowsH, boxA: rowsA,
      plays: plays.slice(-14),
      mvp,
      stats: tstats,
      participants
    };
  }

  TBA.simulateMatch = simulateMatch;

  /* ============================================================
   * 4. 选秀
   * ============================================================ */
  function batchOfTeam(draft, teamId) {
    for (const b in draft.batches) if (draft.batches[b] === teamId) return b;
    return '?';
  }

  function currentSlot(state) {
    const d = state.draft;
    if (!d || d.idx >= d.seq.length) return null;
    const teamId = d.seq[d.idx];
    return { teamId, batch: batchOfTeam(d, teamId) };
  }

  function aiPickPlayer(state, teamId) {
    const d = state.draft;
    const team = state.teams.find(t => t.id === teamId);
    const roster = team.roster.map(id => state.players[id]).filter(Boolean);
    const fwd = roster.filter(p => p.pos === '锋线').length;
    const guard = roster.filter(p => p.pos === '后卫').length;

    const scored = d.pool.map(id => {
      const p = state.players[id];
      let s = p.overall + rand(-3, 7);
      if (p.pos === '锋线' && fwd < 1) s += 9;
      if (p.pos === '后卫' && guard < 2) s += 5;
      if (p.core) s += 5;
      return { id, s };
    });
    scored.sort((a, b) => b.s - a.s);
    return scored.length ? scored[0].id : null;
  }

  function doPick(state, teamId, playerId, wasLocked) {
    const d = state.draft;
    const p = state.players[playerId];
    d.pool = d.pool.filter(id => id !== playerId);
    const pick = { teamId, playerId, batch: batchOfTeam(d, teamId), locked: !!wasLocked };
    d.picks.push(pick);
    d.log.push({
      pickNo: d.picks.length,
      teamId,
      playerId,
      batch: pick.batch,
      text: `${d.picks.length}. [${pick.batch}] ${teamName(state, teamId)} 选中 ${p.name}${wasLocked ? '（锁定）' : ''}`
    });
    d.idx += 1;
    return pick;
  }

  function teamName(state, teamId) {
    const t = state.teams.find(x => x.id === teamId);
    return t ? t.name : teamId;
  }
  TBA.teamName = teamName;

  function stepDraft(state) {
    const d = state.draft;
    if (!d) return { type: 'none' };
    if (d.idx >= d.seq.length) { finishDraft(state); return { type: 'done' }; }

    const teamId = d.seq[d.idx];
    const team = state.teams.find(t => t.id === teamId);

    if (d.locked[teamId] && !d.lockUsed[teamId]) {
      d.lockUsed[teamId] = true;
      doPick(state, teamId, d.locked[teamId], true);
      return { type: 'pick', teamId, playerId: d.locked[teamId], locked: true };
    }
    if (team.human) return { type: 'human', teamId };

    const pid = aiPickPlayer(state, teamId);
    doPick(state, teamId, pid, false);
    return { type: 'pick', teamId, playerId: pid, locked: false };
  }

  function humanPick(state, playerId) {
    const d = state.draft;
    const slot = currentSlot(state);
    if (!slot) return null;
    const team = state.teams.find(t => t.id === slot.teamId);
    if (!team || !team.human) return null;
    if (d.pool.indexOf(playerId) < 0) return null;
    return doPick(state, slot.teamId, playerId, false);
  }

  function batchesByStandings(state) {
    const sorted = state.teams.slice().sort((a, b) => {
      if (b.losses !== a.losses) return b.losses - a.losses;
      const da = a.pf - a.pa, db = b.pf - b.pa;
      if (da !== db) return da - db;
      return Math.random() - 0.5;
    });
    return { A: sorted[0].id, B: sorted[1].id, C: sorted[2].id };
  }

  function startDraft(state, round) {
    const isSecond = round >= 2;
    const prev = isSecond && state.draftHistory.length ? state.draftHistory[state.draftHistory.length - 1] : null;
    const batches = isSecond ? batchesByStandings(state) : (() => {
      const order = shuffle(['T1', 'T2', 'T3']);
      return { A: order[0], B: order[1], C: order[2] };
    })();

    // 把上一轮球员放回池子（建队核心始终留在队里）
    state.teams.forEach(t => { t.roster = [t.core]; });

    const pool = Object.keys(state.players).map(Number).filter(id => !state.players[id].core);

    state.draft = {
      round,
      stage: isSecond ? 'lock' : 'pick',
      batches,
      seq: TBA.DRAFT_ORDER.map(b => batches[b]),
      idx: 0,
      pool,
      picks: [],
      log: [],
      locked: {},
      lockUsed: {},
      previous: prev,
      humanLocked: undefined
    };
    state.phase = 'draft';
  }

  function aiLockChoices(state) {
    const d = state.draft;
    if (!d.previous) return;
    state.teams.filter(t => !t.human).forEach(t => {
      const roster = ((d.previous.rosterAfter && d.previous.rosterAfter[t.id]) || [])
        .filter(id => id !== d.previous.firstPick[t.id]);
      if (!roster.length) return;
      if (Math.random() < 0.7) {
        const best = roster.map(id => state.players[id]).sort((a, b) => b.overall - a.overall)[0];
        d.locked[t.id] = best.id;
      }
    });
  }

  function humanLock(state, playerId) {
    const d = state.draft;
    if (!d || d.stage !== 'lock') return false;
    const human = state.teams.find(t => t.human);
    if (playerId !== null) {
      const allowed = ((d.previous.rosterAfter && d.previous.rosterAfter[human.id]) || [])
        .filter(id => id !== d.previous.firstPick[human.id]);
      if (allowed.indexOf(playerId) < 0) return false;
      d.locked[human.id] = playerId;
    }
    aiLockChoices(state);
    // 被锁定的球员立即从池子里拿掉，其他球队不能截胡
    Object.keys(d.locked).forEach(tid => {
      const pid = d.locked[tid];
      if (pid) d.pool = d.pool.filter(id => id !== pid);
    });
    d.stage = 'pick';
    return true;
  }

  function finishDraft(state) {
    const d = state.draft;

    // 本轮开始前的阵容（不含建队核心），供下一轮锁定使用
    const rosterBefore = {};
    state.teams.forEach(t => {
      rosterBefore[t.id] = d.previous && d.previous.rosterAfter ? (d.previous.rosterAfter[t.id] || []) : [];
    });

    state.teams.forEach(t => {
      const picked = d.picks.filter(p => p.teamId === t.id).map(p => p.playerId);
      t.roster = [t.core].concat(picked);
      t.roster = Array.from(new Set(t.roster));
      t.roster.forEach(id => {
        const p = state.players[id];
        if (p) { p.stamina = Math.max(p.stamina, 85); p.injury = 0; }
      });
    });

    const firstPick = {};
    state.teams.forEach(t => {
      const first = d.picks.find(p => p.teamId === t.id);
      firstPick[t.id] = first ? first.playerId : null;
    });

    const rosterAfter = {};
    state.teams.forEach(t => { rosterAfter[t.id] = t.roster.filter(id => id !== t.core); });

    state.draftHistory.push({
      round: d.round,
      date: state.date,
      batches: d.batches,
      picks: d.picks.slice(),
      firstPick,
      rosterBefore,
      rosterAfter
    });

    state.freeAgents = d.pool.slice();
    state.draft = null;
    state.phase = 'season';
    Game.log(state, d.round === 1 ? '选秀大会结束，三支球队组建完毕。' : '中期选秀结束，联盟进入下半程。');
  }

  const draftApi = {
    start: startDraft,
    step: stepDraft,
    humanPick,
    humanLock,
    currentSlot,
    batchOfTeam,
    teamName
  };
  TBA.draft = draftApi;

  /* ============================================================
   * 5. 游戏状态
   * ============================================================ */
  const SAVE_KEY = 'tba_sim_save_v1';
  const Game = {};
  TBA.game = Game;

  Game.hasSave = function () {
    try { return !!global.localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  };
  Game.save = function (state) {
    try {
      global.localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      return true;
    } catch (e) { return false; }
  };
  Game.load = function () {
    try {
      const raw = global.localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || s.v !== 1) return null;
      Game.state = s;
      return s;
    } catch (e) { return null; }
  };
  Game.clearSave = function () {
    try { global.localStorage.removeItem(SAVE_KEY); } catch (e) {}
  };

  Game.log = function (state, text, kind) {
    state.log.unshift({ date: state.date, text, kind: kind || 'info' });
    if (state.log.length > 60) state.log.length = 60;
  };

  Game.create = function () {
    const players = buildPlayers();
    const state = {
      v: 1,
      character: '大娘',
      phase: 'draft',
      date: SEA.start,
      players,
      teams: [
        { id: 'T1', name: '大娘队', core: 1, human: true, roster: [1], wins: 0, losses: 0, pf: 0, pa: 0 },
        { id: 'T2', name: '奶龙队', core: 2, human: false, roster: [2], wins: 0, losses: 0, pf: 0, pa: 0 },
        { id: 'T3', name: '走刀队', core: 3, human: false, roster: [3], wins: 0, losses: 0, pf: 0, pa: 0 }
      ],
      draft: null,
      draftHistory: [],
      history: [],
      log: [],
      buffs: { hotHand: false },
      freeAgents: [],
      flags: { secondDraftDone: false },
      lastResult: null
    };
    Game.log(state, '2025 年 7 月 2 日，暑假留校第一天。三支球队的建队核心聚在球场边，开始选秀。');
    startDraft(state, 1);
    Game.state = state;
    return state;
  };

  Game.humanTeam = function (state) {
    return state.teams.find(t => t.human);
  };

  Game.teamById = function (state, id) {
    return state.teams.find(t => t.id === id);
  };

  Game.rosterPlayers = function (state, teamId) {
    const t = Game.teamById(state, teamId);
    if (!t) return [];
    return t.roster.map(id => state.players[id]).filter(Boolean);
  };

  Game.canField = function (state, teamId) {
    return Game.rosterPlayers(state, teamId).filter(p => p.injury <= 0).length >= CFG.lineupSize;
  };

  Game.standings = function (state) {
    return state.teams.slice().sort((a, b) => {
      const wa = a.wins + a.losses ? a.wins / (a.wins + a.losses) : 0;
      const wb = b.wins + b.losses ? b.wins / (b.wins + b.losses) : 0;
      if (wb !== wa) return wb - wa;
      return (b.pf - b.pa) - (a.pf - a.pa);
    });
  };

  function applyResult(state, result) {
    const home = Game.teamById(state, result.homeId);
    const away = Game.teamById(state, result.awayId);
    home.pf += result.scoreH; home.pa += result.scoreA;
    away.pf += result.scoreA; away.pa += result.scoreH;
    if (result.winnerId === home.id) { home.wins++; away.losses++; }
    else { away.wins++; home.losses++; }

    const isHumanMatch = home.human || away.human;

    Object.keys(result.participants).forEach(id => {
      const p = state.players[id];
      if (!p) return;
      const factor = result.participants[id];
      p.stamina = clamp(p.stamina - CFG.staminaMatch * factor, 0, 100);
      if (p.stamina < CFG.injuryThreshold && p.injury <= 0 && Math.random() < CFG.injuryChance) {
        p.injury = randInt(2, 4);
        if (isHumanMatch && (result.homeId === 'T1' || result.awayId === 'T1')) {
          Game.log(state, `${p.name} 在比赛中受伤，预计缺阵 ${p.injury} 天。`, 'bad');
        }
      }
    });

    if (state.buffs.hotHand && (home.human || away.human)) state.buffs.hotHand = false;

    state.history.unshift({
      date: state.date,
      homeId: result.homeId,
      awayId: result.awayId,
      scoreH: result.scoreH,
      scoreA: result.scoreA,
      winnerId: result.winnerId,
      mvpId: result.mvp.id
    });
    if (state.history.length > 100) state.history.length = 100;
  }

  Game.previewMatch = function (state, opponentId) {
    const human = Game.humanTeam(state);
    const opp = Game.teamById(state, opponentId);
    const mine = chooseLineup(state, human);
    const theirs = chooseLineup(state, opp);
    return { human, opp, mine, theirs };
  };

  Game.playableOpponents = function (state) {
    return state.teams.filter(t => !t.human && Game.canField(state, t.id));
  };

  Game.playMatch = function (state, opponentId) {
    if (!Game.canField(state, 'T1') || !Game.canField(state, opponentId)) return null;
    const result = simulateMatch(state, 'T1', opponentId);
    if (!result) return null;
    applyResult(state, result);
    state.lastResult = result;
    const opp = Game.teamById(state, opponentId);
    const win = result.winnerId === 'T1';
    Game.log(
      state,
      `大娘队 ${result.scoreH} : ${result.scoreA} ${opp.name}，${win ? '拿下胜利！' : '遗憾落败。'}`,
      win ? 'win' : 'lose'
    );
    Game.advance(state);
    Game.save(state);
    return result;
  };

  Game.train = function (state, attr) {
    const human = Game.humanTeam(state);
    const players = Game.rosterPlayers(state, human.id).filter(p => p.injury <= 0);
    const gains = [];
    players.forEach(p => {
      const inc = Math.random() < 0.25 ? 2 : 1;
      p.attrs[attr] = clamp(p.attrs[attr] + inc, 30, 99);
      p.overall = overallOf(p);
      p.stamina = clamp(p.stamina - CFG.staminaTrain, 0, 100);
      gains.push({ name: p.name, inc });
    });
    Game.log(state, `全队加练${ATTR_CN[attr]}，${gains.map(g => g.name + ' +' + g.inc).join('、')}。`, 'train');
    Game.advance(state);
    Game.save(state);
    return gains;
  };

  Game.rest = function (state) {
    const human = Game.humanTeam(state);
    Game.rosterPlayers(state, human.id).forEach(p => {
      p.stamina = clamp(p.stamina + 6, 0, 100);
    });
    Game.log(state, '全队休整，体力有所恢复。', 'rest');
    Game.advance(state);
    Game.save(state);
  };

  Game.skip = function (state) {
    const target = nextPlayable(state.date, false);
    if (!target) { Game.advance(state); Game.save(state); return null; }
    let guard = 0;
    while (state.date < target && guard++ < 60) {
      if (state.phase !== 'season') break;
      Game.advance(state, { quiet: true });
    }
    Game.save(state);
    return state.date;
  };

  Game.advance = function (state, opts) {
    opts = opts || {};
    if (state.phase === 'end') return;

    state.date = calendar.addDays(state.date, 1);

    // 每日恢复
    Object.keys(state.players).forEach(id => {
      const p = state.players[id];
      if (p.injury > 0) p.injury = Math.max(0, p.injury - 1);
      else p.stamina = clamp(p.stamina + CFG.staminaRest, 0, 100);
    });

    if (state.date > SEA.end) {
      state.phase = 'end';
      Game.log(state, '赛季结束。');
      return;
    }

    // 中期选秀
    if (!state.flags.secondDraftDone && state.date === CFG.secondDraftDate) {
      state.flags.secondDraftDone = true;
      startDraft(state, 2);
      Game.log(state, '寒假留校第一天，联盟宣布进行中期选秀。', 'draft');
      return;
    }

    const info = calendar.dayInfo(state.date);

    // AI 之间的比赛
    if (info.playable && !opts.quiet) {
      const aiTeams = state.teams.filter(t => !t.human && Game.canField(state, t.id));
      if (aiTeams.length === 2 && Math.random() < CFG.aiMatchChance) {
        const r = simulateMatch(state, aiTeams[0].id, aiTeams[1].id);
        if (r) {
          applyResult(state, r);
          const t0 = Game.teamById(state, r.homeId).name;
          const t1 = Game.teamById(state, r.awayId).name;
          Game.log(state, `${t0} ${r.scoreH} : ${r.scoreA} ${t1}（AI 比赛）`, 'ai');
        }
      }
    } else if (info.playable && opts.quiet) {
      const aiTeams = state.teams.filter(t => !t.human && Game.canField(state, t.id));
      if (aiTeams.length === 2 && Math.random() < CFG.aiMatchChance) {
        const r = simulateMatch(state, aiTeams[0].id, aiTeams[1].id);
        if (r) applyResult(state, r);
      }
    }

    // 随机校园事件
    if (!opts.quiet && Math.random() < CFG.eventChance && info.inSeason) {
      Game.triggerEvent(state);
    }
  };

  Game.triggerEvent = function (state) {
    const ev = TBA.EVENTS[randInt(0, TBA.EVENTS.length - 1)];
    const human = Game.humanTeam(state);
    const players = Game.rosterPlayers(state, human.id);
    (ev.effects || []).forEach(fx => {
      if (fx.type === 'stamina') {
        players.forEach(p => { p.stamina = clamp(p.stamina + fx.value, 0, 100); });
      } else if (fx.type === 'attr') {
        players.forEach(p => {
          p.attrs[fx.attr] = clamp(p.attrs[fx.attr] + fx.value, 30, 99);
          p.overall = overallOf(p);
        });
      } else if (fx.type === 'buff') {
        state.buffs[fx.key] = true;
      }
    });
    state.lastEvent = { title: ev.title, text: ev.text, date: state.date };
    Game.log(state, `【${ev.title}】${ev.text}`, 'event');
    return ev;
  };

  Game.seasonSummary = function (state) {
    const standings = Game.standings(state);
    const champion = standings[0];
    const human = Game.humanTeam(state);
    const topGames = state.history.slice(0, 8);
    return { standings, champion, human, topGames };
  };

  /* 选秀阶段的中断提示文案 */
  Game.draftPhaseText = function (state) {
    const d = state.draft;
    if (!d) return '';
    return d.round === 1 ? '第一次选秀大会' : '中期选秀大会';
  };

  /* ============================================================
   * 6. 导出
   * ============================================================ */
  TBA.utils = { clamp, rand, randInt, shuffle, hash, weightedPick, avg };
  TBA.engine = {
    buildPlayers, overallOf, effAttr, traitMod, staminaFactor, chooseLineup, healthyOf
  };
})(typeof window !== 'undefined' ? window : globalThis);
