/*!
 * TBA 模拟器 · 核心引擎
 * 日历 / 球员属性 / 每场 15 人池与组队 / 3v3 比赛模拟 / 游戏状态
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
      reason = `${exam.label}第 ${idx} 天 · 每天晚上都能打球，客串球员也会到场`;
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
  function healthyByIds(state, ids) {
    return ids.map(id => state.players[id]).filter(p => p && p.injury <= 0);
  }

  function chooseLineupFrom(state, ids, leaderId) {
    const pool = healthyByIds(state, ids);
    if (pool.length < CFG.lineupSize) return null;
    const sorted = pool.slice().sort((a, b) =>
      (b.overall * staminaFactor(b.stamina)) - (a.overall * staminaFactor(a.stamina))
    );
    let lineup = sorted.slice(0, CFG.lineupSize);
    // 领袖必须首发：他是带队的人
    if (leaderId) {
      const leader = pool.find(p => p.id === leaderId);
      if (leader && lineup.indexOf(leader) < 0) {
        lineup = [leader].concat(sorted.filter(p => p.id !== leaderId).slice(0, CFG.lineupSize - 1));
      }
    }
    return lineup;
  }

  /**
   * opts.rosters = { H: [id...], A: [id...] } —— 每场比赛前临时组队的名单
   */
  function simulateMatch(state, homeId, awayId, opts) {
    const home = state.teams.find(t => t.id === homeId);
    const away = state.teams.find(t => t.id === awayId);
    if (!home || !away) return null;
    if (!opts || !opts.rosters) return null;

    const rosterH = (opts.rosters.H || []).filter(Boolean);
    const rosterA = (opts.rosters.A || []).filter(Boolean);
    if (rosterH.length < CFG.lineupSize || rosterA.length < CFG.lineupSize) return null;

    const startH = (opts.lineupH && opts.lineupH.length)
      ? opts.lineupH.map(id => state.players[id])
      : chooseLineupFrom(state, rosterH, home.core);
    const startA = chooseLineupFrom(state, rosterA, away.core);
    if (!startH || !startA) return null;
    if (startH.some(p => !p || p.injury > 0 || rosterH.indexOf(p.id) < 0)) return null;

    const side = {
      H: { team: home, lineup: startH.slice(), bench: healthyByIds(state, rosterH).filter(p => startH.indexOf(p) < 0) },
      A: { team: away, lineup: startA.slice(), bench: healthyByIds(state, rosterA).filter(p => startA.indexOf(p) < 0) }
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
      // 领袖不下场，换综合最低的那个
      const weakList = s.lineup.filter(p => !p.core);
      if (!weakList.length) return;
      const weakest = weakList.slice().sort((a, b) => a.overall - b.overall)[0];
      const best = s.bench.slice().sort((a, b) => b.overall - a.overall)[0];
      if (!best || !weakest) return;
      if (best.overall < weakest.overall - 8) return;
      s.lineup[s.lineup.indexOf(weakest)] = best;
      s.bench[s.bench.indexOf(best)] = weakest;
    }

    const target = (opts && opts.winScore) || CFG.winScore;
    const winBy = target >= 21 ? 2 : 1; // 抢 7 分不用领先 2 分
    while (possession < CFG.maxPossessions) {
      if ((scoreH >= target || scoreA >= target) && Math.abs(scoreH - scoreA) >= winBy) break;

      if (possession > 0 && possession % 14 === 0) { rotate('H'); rotate('A'); }

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

      let text = '';
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
            text = `${passer.name} 助攻 ${shooter.name} ${isThree ? '三分' : '上篮'}命中`;
          } else {
            text = `${shooter.name} ${isThree ? '三分' : '强攻'}命中`;
          }
        } else {
          text = `${shooter.name} ${isThree ? '三分冷箭' : '突破得手'}`;
        }
      } else if (Math.random() < 0.32) {
        // 前场篮板
        const rebounder = weightedPick(atk.lineup, p => effAttr(p, 'reb'));
        box[rebounder.id].reb += 1;
        text = `${shooter.name} ${isThree ? '三分' : '出手'}不中，${rebounder.name} 抢下前场篮板`;
        plays.push({ no: plays.length + 1, side: atkKey, text, score: `${scoreH}-${scoreA}` });
        possession++;
        continue; // 二次进攻，球权不变
      } else {
        const rebounder = weightedPick(def.lineup, p => effAttr(p, 'reb') * 1.1);
        box[rebounder.id].reb += 1;
        text = `${shooter.name} ${isThree ? '三分' : '出手'}不中，${rebounder.name} 保护后场篮板`;
        offense = defKey;
      }

      plays.push({ no: plays.length + 1, side: atkKey, text, score: `${scoreH}-${scoreA}` });
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

    const minutes = Math.max(3, Math.round(possession * CFG.minutePerPossession));

    return {
      date: state.date,
      homeId, awayId,
      scoreH, scoreA,
      winnerId, loserId: scoreH > scoreA ? awayId : homeId,
      boxH: rowsH, boxA: rowsA,
      lineupH: startH.map(p => p.id),
      lineupA: startA.map(p => p.id),
      plays,
      mvp,
      stats: tstats,
      possessions: possession,
      minutes,
      target,
      participants
    };
  }

  TBA.simulateMatch = simulateMatch;


  /* ============================================================
   * 5. 游戏状态
   * ============================================================ */
  const SAVE_KEY = 'tba_sim_save_v1';
  const Game = {};
  TBA.game = Game;

  Game.hasSave = function () {
    try {
      const raw = global.localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      return !!(s && s.v === 2);
    } catch (e) { return false; }
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
      if (!s || s.v !== 2) return null;
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

  /**
   * 老师点评：按日期轮值一位老师，从对应语境里取一句
   * context: 'day' | 'win' | 'lose' | 'train' | 'rest'
   * 只有「常规上学日」的 day 点评才返回内容（假期/留校没有课）
   */
  Game.teacherComment = function (state, context, dateStr, extra) {
    const date = dateStr || state.date;
    const info = calendar.dayInfo(date);
    if (!info.inSeason) return null;
    const isSchool = info.period && info.period.kind === 'school';
    // 上课点评只出现在正常上学的非考试日
    if (context === 'day' && (!isSchool || info.exam)) return null;
    const teacherName = TBA.TEACHER_BY_WEEKDAY[info.weekday] || '秦始皇';
    const teacher = TBA.TEACHERS.find(t => t.name === teacherName) || { name: teacherName, role: '' };
    const table = TBA.TEACHER_LINES[teacherName] || {};
    const lines = table[context] || [];
    if (!lines.length) return null;
    const idx = hash(date + '|' + context + '|' + (extra || '')) % lines.length;
    return { name: teacher.name, role: teacher.role, text: lines[idx], date, isSchool };
  };

  Game.create = function () {
    const players = buildPlayers();
    const state = {
      v: 2,
      character: '大娘',
      phase: 'season',
      date: SEA.start,
      players,
      teams: [
        { id: 'T1', name: '大娘队', core: 1, human: true, wins: 0, losses: 0, pf: 0, pa: 0 },
        { id: 'T2', name: '奶龙队', core: 2, human: false, wins: 0, losses: 0, pf: 0, pa: 0 },
        { id: 'T3', name: '走刀队', core: 3, human: false, wins: 0, losses: 0, pf: 0, pa: 0 }
      ],
      history: [],
      log: [],
      buffs: { hotHand: false },
      playerStats: {},
      lastResult: null,
      lastTeam: null,
      lastSession: null,
      lastDayTeams: null,
      session: null
    };
    Game.log(state, '2025 年 7 月 2 日，高三的暑假留校第一天。球场上没有固定阵容，谁来了谁上。', 'info');
    Game.state = state;
    return state;
  };

  Game.humanTeam = function (state) {
    return state.teams.find(t => t.human);
  };

  Game.teamById = function (state, id) {
    return state.teams.find(t => t.id === id);
  };

  // 上一场代表“大娘队”出场的 6 人（用于主界面展示，不是固定阵容）
  Game.lastTeamPlayers = function (state) {
    return (state.lastTeam || []).map(id => state.players[id]).filter(Boolean);
  };

  // 三队车轮战至少要有 3 名领袖 + 每队 4 人
  Game.canStartMatch = function (state) {
    const need = CFG.teamSize * CFG.teamsPerDay;
    return Object.values(state.players).filter(p => p.injury <= 0).length >= need;
  };

  Game.standings = function (state) {
    return state.teams.slice().sort((a, b) => {
      const wa = a.wins + a.losses ? a.wins / (a.wins + a.losses) : 0;
      const wb = b.wins + b.losses ? b.wins / (b.wins + b.losses) : 0;
      if (wb !== wa) return wb - wa;
      return (b.pf - b.pa) - (a.pf - a.pa);
    });
  };

  function applyResult(state, result, opts) {
    opts = opts || {};
    const home = Game.teamById(state, result.homeId);
    const away = Game.teamById(state, result.awayId);
    home.pf += result.scoreH; home.pa += result.scoreA;
    away.pf += result.scoreA; away.pa += result.scoreH;
    if (result.winnerId === home.id) { home.wins++; away.losses++; }
    else { away.wins++; home.losses++; }

    const isHumanMatch = home.human || away.human;
    const cost = opts.session ? CFG.staminaPerGame : CFG.staminaMatch;
    const injuryChance = opts.session ? CFG.injuryChance * 0.5 : CFG.injuryChance;

    Object.keys(result.participants).forEach(id => {
      const p = state.players[id];
      if (!p) return;
      const factor = result.participants[id];
      p.stamina = clamp(p.stamina - cost * factor, 0, 100);
      // 建队核心不受伤：每场都得有人带队
      if (!p.core && p.stamina < CFG.injuryThreshold && p.injury <= 0 && Math.random() < injuryChance) {
        p.injury = randInt(2, 4);
        if (isHumanMatch && (result.homeId === 'T1' || result.awayId === 'T1')) {
          Game.log(state, `${p.name} 在比赛中受伤，预计缺阵 ${p.injury} 天。`, 'bad');
        }
      }
    });

    if (state.buffs.hotHand && (home.human || away.human)) state.buffs.hotHand = false;

    // 赛季累计球员数据
    if (!state.playerStats) state.playerStats = {};
    [result.boxH, result.boxA].forEach(rows => {
      rows.forEach(r => {
        if (!r.min) return;
        const s = state.playerStats[r.id] || (state.playerStats[r.id] = { gp: 0, pts: 0, reb: 0, ast: 0 });
        s.gp += 1;
        s.pts += r.pts;
        s.reb += r.reb;
        s.ast += r.ast;
      });
    });

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

  /* ---------------- 每场比赛前的「到场 15 人」 ---------------- */
  const isGuest = p => p.role === TBA.GUEST_ROLE;

  /**
   * 生成当天的球员池：
   *  - 锋线全来（含三位建队核心）
   *  - 后卫随机来（客串球员只在考试期间出现）
   *  - 总人数固定 15（含领袖）
   */
  Game.buildPool = function (state) {
    const exam = !!calendar.dayInfo(state.date).exam;
    const all = Object.values(state.players).filter(p => p.injury <= 0);
    const forwards = all.filter(p => p.pos === '锋线').sort((a, b) => b.overall - a.overall);
    const guards = shuffle(all.filter(p => p.pos === '后卫' && (exam || !isGuest(p))));

    const pool = forwards.slice();
    for (const g of guards) {
      if (pool.length >= CFG.poolSize) break;
      pool.push(g);
    }
    // 极端情况（伤号太多）用剩下的健康球员补满
    if (pool.length < CFG.poolSize) {
      const rest = shuffle(all.filter(p => pool.indexOf(p) < 0));
      for (const r of rest) {
        if (pool.length >= CFG.poolSize) break;
        pool.push(r);
      }
    }
    // 三位领袖只要健康就一定到场
    state.teams.forEach(t => {
      const core = state.players[t.core];
      if (core && core.injury <= 0 && pool.indexOf(core) < 0 && pool.length < CFG.poolSize) pool.push(core);
    });
    return pool;
  };

  Game.poolSummary = function (pool) {
    return {
      total: pool.length,
      forwards: pool.filter(p => p.pos === '锋线').length,
      guards: pool.filter(p => p.pos === '后卫').length,
      guests: pool.filter(p => isGuest(p)).length
    };
  };

  // AI 领袖的选人逻辑：先补位置，再挑综合
  Game.aiPick = function (state, pool, teamIds) {
    const picked = teamIds.map(id => state.players[id]);
    const forwards = picked.filter(p => p.pos === '锋线').length;
    const guards = picked.filter(p => p.pos === '后卫').length;
    const scored = pool.map(p => {
      let score = p.overall + rand(-2, 5);
      if (p.pos === '锋线' && forwards < 1) score += 10;
      if (p.pos === '后卫' && guards < 2) score += 6;
      return { p, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.length ? scored[0].p : null;
  };

  /**
   * 每日三队车轮战：15 人分成三队，每队 5 人（领袖 + 4 轮选）
   * 返回 { pool, teams: {T1:[],T2:[],T3:[]}, order: [队 id...] }
   * 纯 AI 用；玩家那队由 UI 负责选。
   */
  Game.buildDayTeams = function (state) {
    const pool = Game.buildPool(state).slice();
    const ids = state.teams.map(t => t.id);
    const order = shuffle(ids);
    const teams = {};
    ids.forEach(id => { teams[id] = []; });

    // 领袖直接归队
    state.teams.forEach(t => {
      const p = state.players[t.core];
      if (!p) return;
      teams[t.id].push(t.core);
      const idx = pool.indexOf(p);
      if (idx >= 0) pool.splice(idx, 1);
    });

    // 蛇形轮选：A B C C B A A B C C B A
    const rounds = CFG.teamSize - 1;
    for (let r = 0; r < rounds; r++) {
      const seq = r % 2 === 0 ? order.slice() : order.slice().reverse();
      for (const teamId of seq) {
        const p = Game.aiPick(state, pool, teams[teamId]);
        if (!p) continue;
        teams[teamId].push(p.id);
        pool.splice(pool.indexOf(p), 1);
      }
    }
    state.lastDayTeams = teams;
    return { pool, teams, order };
  };

  // 某天用什么分数制：周日抢 21，其余抢 7
  Game.winScoreOf = function (state, dateStr) {
    const d = dateStr || state.date;
    return calendar.weekdayOf(d) === 0 ? CFG.sundayWinScore : CFG.winScore;
  };

  Game.playableOpponents = function (state) {
    return state.teams.filter(t => !t.human);
  };

  /**
   * 开始今天的一轮车轮战
   * teams = { T1:[...], T2:[...], T3:[...] }，每队 teamSize 人
   */
  Game.startSession = function (state, teams) {
    const ids = state.teams.map(t => t.id);
    for (const id of ids) {
      const roster = teams[id] || [];
      if (roster.length !== CFG.teamSize) return null;
      if (new Set(roster).size !== CFG.teamSize) return null;
      if (roster.some(pid => !state.players[pid] || state.players[pid].injury > 0)) return null;
    }
    const all = ids.reduce((acc, id) => acc.concat(teams[id]), []);
    if (new Set(all).size !== all.length) return null;

    // 大娘队先上，对手随机，第三队在场下等
    const others = shuffle(ids.filter(id => id !== 'T1'));
    state.session = {
      date: state.date,
      teams,
      court: ['T1', others[0]],
      waiting: others[1],
      elapsed: 0,
      limit: CFG.sessionMinutes,
      target: Game.winScoreOf(state, state.date),
      games: [],
      finished: false
    };
    state.phase = 'session';
    return state.session;
  };

  /**
   * 打当前这一场：赢的留在场上，输的下场，场下那队上来
   */
  Game.sessionPlay = function (state) {
    const s = state.session;
    if (!s || s.finished) return null;
    const [a, b] = s.court;
    const rosters = { H: s.teams[a].slice(), A: s.teams[b].slice() };
    const result = simulateMatch(state, a, b, {
      rosters,
      winScore: s.target
    });
    if (!result) return null;

    applyResult(state, result, { session: true });
    state.lastResult = result;
    state.lastTeam = rosters.H.slice();

    const loser = result.winnerId === a ? b : a;
    const winner = result.winnerId;
    const nextUp = s.waiting;
    const game = {
      no: s.games.length + 1,
      homeId: a,
      awayId: b,
      scoreH: result.scoreH,
      scoreA: result.scoreA,
      winnerId: winner,
      loserId: loser,
      minutes: result.minutes,
      detail: {
        boxH: result.boxH,
        boxA: result.boxA,
        plays: result.plays,
        mvp: result.mvp
      }
    };
    s.games.push(game);
    s.elapsed += result.minutes;
    s.waiting = loser;
    s.court = [winner, nextUp];

    if (s.elapsed >= s.limit) {
      s.finished = true;
    }
    return { result, game, session: s };
  };

  /**
   * 结束车轮战：结算当天、写日志、进入第二天
   */
  Game.endSession = function (state) {
    const s = state.session;
    if (!s) return null;
    const humanGames = s.games.filter(g => g.homeId === 'T1' || g.awayId === 'T1');
    const wins = humanGames.filter(g => g.winnerId === 'T1').length;
    const losses = humanGames.length - wins;
    Game.log(
      state,
      `车轮战 ${s.games.length} 场（${s.elapsed} 分钟），大娘队 ${wins} 胜 ${losses} 负。`,
      wins >= losses ? 'win' : 'lose'
    );
    const summary = {
      games: s.games.map(g => ({
        no: g.no, homeId: g.homeId, awayId: g.awayId,
        scoreH: g.scoreH, scoreA: g.scoreA,
        winnerId: g.winnerId, loserId: g.loserId, minutes: g.minutes
      })),
      lastDetail: s.games.length ? s.games[s.games.length - 1].detail : null,
      lastGame: s.games.length ? s.games[s.games.length - 1] : null,
      elapsed: s.elapsed,
      target: s.target,
      wins,
      losses,
      humanGames: humanGames.map(g => ({ no: g.no, homeId: g.homeId, awayId: g.awayId, scoreH: g.scoreH, scoreA: g.scoreA, winnerId: g.winnerId }))
    };
    state.lastSession = summary;
    state.session = null;
    state.phase = 'season';
    Game.advance(state, { skipAi: true });
    Game.save(state);
    return summary;
  };

  Game.train = function (state, attr) {
    const players = Object.values(state.players).filter(p => p.injury <= 0);
    const gains = [];
    players.forEach(p => {
      const inc = Math.random() < 0.25 ? 2 : 1;
      p.attrs[attr] = clamp(p.attrs[attr] + inc, 30, 99);
      p.overall = overallOf(p);
      p.stamina = clamp(p.stamina - CFG.staminaTrain, 0, 100);
      gains.push({ name: p.name, inc });
    });
    Game.log(state, `全班加练${ATTR_CN[attr]}，${gains.map(g => g.name + ' +' + g.inc).join('、')}。`, 'train');
    Game.advance(state);
    Game.save(state);
    return gains;
  };

  Game.rest = function (state) {
    const info = calendar.dayInfo(state.date);
    Object.values(state.players).forEach(p => {
      if (p.injury <= 0) p.stamina = clamp(p.stamina + 6, 0, 100);
    });
    // 假期里天天休息，不必每天都记一条动态
    if (info.playable) Game.log(state, '全场休整，体力有所恢复。', 'rest');
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
      Game.log(state, '高考结束，赛季也落幕了。');
      return;
    }

    const info = calendar.dayInfo(state.date);

    // 玩家今天休息时，AI 两队自己打一场
    if (info.playable && !opts.skipAi) {
      const aiTeams = state.teams.filter(t => !t.human);
      if (aiTeams.length >= 2 && Math.random() < CFG.aiMatchChance) {
        const day = Game.buildDayTeams(state);
        const a = aiTeams[0].id;
        const b = aiTeams[1].id;
        const r = simulateMatch(state, a, b, {
          rosters: { H: day.teams[a], A: day.teams[b] },
          winScore: Game.winScoreOf(state, state.date)
        });
        if (r) {
          applyResult(state, r);
          const t0 = Game.teamById(state, r.homeId).name;
          const t1 = Game.teamById(state, r.awayId).name;
          Game.log(state, `${t0} ${r.scoreH} : ${r.scoreA} ${t1}（AI 比赛）`, 'ai');
        }
      }
    }

    // 随机校园事件
    if (!opts.quiet && Math.random() < CFG.eventChance && info.inSeason) {
      Game.triggerEvent(state);
    }
  };

  Game.triggerEvent = function (state) {
    const ev = TBA.EVENTS[randInt(0, TBA.EVENTS.length - 1)];
    const players = Object.values(state.players).filter(p => p.injury <= 0);
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

  /* ============================================================
   * 6. 导出
   * ============================================================ */
  TBA.utils = { clamp, rand, randInt, shuffle, hash, weightedPick, avg };
  TBA.engine = {
    buildPlayers, overallOf, effAttr, traitMod, staminaFactor, chooseLineupFrom, healthyByIds
  };
})(typeof window !== 'undefined' ? window : globalThis);
