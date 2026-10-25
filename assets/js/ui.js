/*!
 * TBA 模拟器 · 界面层
 */
(function (global) {
  'use strict';
  const TBA = global.TBA;
  const Game = TBA.game;
  const Cal = TBA.calendar;
  const CFG = TBA.CONFIG;
  const ATTR_CN = TBA.ATTR_CN;
  const ATTR_KEYS = TBA.ATTR_KEYS;
  const WEEK = Cal.WEEK_CN;

  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const UI = {
    calMonth: null,
    lastDate: null,
    buildTimer: null,
    buildBusy: false,
    statTab: 'pts'
  };

  /* ============================================================
   * 基础
   * ============================================================ */
  let modalOnClose = null;

  function show(id) {
    $$('.screen').forEach(el => el.classList.toggle('is-active', el.id === id));
    global.scrollTo(0, 0);
  }

  function render() {
    const st = Game.state;
    if (!st) { show('screen-title'); renderTitle(); return; }
    if (st.phase === 'end') { show('screen-end'); renderEnd(); return; }
    show('screen-main');
    renderMain();
    if (st.phase === 'session') openSession();
  }

  function openModal(html, opts) {
    opts = opts || {};
    modalOnClose = typeof opts.onClose === 'function' ? opts.onClose : null;
    const root = $('#modal-root');
    root.innerHTML = `
      <div class="modal-backdrop" data-close="1"></div>
      <div class="modal ${opts.wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true">
        ${html}
      </div>`;
    root.classList.add('is-open');
    root.querySelectorAll('[data-close]').forEach(el => {
      el.addEventListener('click', () => closeModal(modalOnClose));
    });
  }

  function closeModal(cb) {
    const root = $('#modal-root');
    root.classList.remove('is-open');
    root.innerHTML = '';
    modalOnClose = null;
    if (typeof cb === 'function') cb();
  }

  function modalHead(title, sub) {
    return `<div class="modal-head">
      <div><h3>${esc(title)}</h3>${sub ? `<p>${esc(sub)}</p>` : ''}</div>
      <button class="modal-close" data-close="1">×</button>
    </div>`;
  }

  function posChip(pos) {
    return pos === '锋线'
      ? '<span class="chip chip-fwd">锋线</span>'
      : '<span class="chip chip-guard">后卫</span>';
  }

  function attrLine(k, v) {
    return `<div class="attr-line">
      <span class="k">${ATTR_CN[k]}</span>
      <span class="bar"><i style="width:${v}%"></i></span>
      <span class="v">${v}</span>
    </div>`;
  }

  function staminaClass(v) {
    return v < 35 ? 'low' : v < 65 ? 'mid' : '';
  }

  function playerCard(p, disabled) {
    const keys = p.pos === '锋线' ? ['str', 'reb', 'shot', 'def'] : ['spd', 'shot', 'three', 'def'];
    return `<button class="player-card" data-id="${p.id}" ${disabled ? 'disabled' : ''}>
      <div class="pc-top">
        <div>
          <div class="pc-name">${esc(p.name)}</div>
          <div class="pc-sub">${p.h}cm · ${p.w}kg · ${esc(p.role)}</div>
        </div>
        <div class="pc-ovr">${p.overall}<small>OVR</small></div>
      </div>
      <div class="pc-tags">${posChip(p.pos)}${p.core ? '<span class="chip chip-live">建队核心</span>' : ''}</div>
      <div class="pc-attrs">
        ${keys.map(k => `<div class="attr"><span class="attr-k">${ATTR_CN[k]}</span><span class="bar"><i style="width:${p.attrs[k]}%"></i></span><b>${p.attrs[k]}</b></div>`).join('')}
      </div>
      <div class="pc-trait"><b>${esc(p.trait || '无特性')}</b>${p.traitDesc ? ' · ' + esc(p.traitDesc) : ''}</div>
    </button>`;
  }

  /* ============================================================
   * 标题页
   * ============================================================ */
  function seasonStats() {
    let d = TBA.SEASON.start;
    let total = 0, playable = 0, exam = 0;
    while (d <= TBA.SEASON.end && total < 400) {
      const info = Cal.dayInfo(d);
      total++;
      if (info.playable) playable++;
      if (info.exam) exam++;
      d = Cal.addDays(d, 1);
    }
    return { total, playable, exam };
  }

  function renderTitle() {
    const has = Game.hasSave();
    $('#btn-continue').hidden = !has;
    $('#save-hint').textContent = has
      ? '检测到本地存档，可以继续上次的赛季。'
      : '高三的第一场球，从今天到场的 15 人开始分三队。';
    const s = seasonStats();
    const strip = $('#season-strip');
    if (strip && !strip.dataset.ready) {
      strip.innerHTML = `
        <div><b>${s.total}</b><span>赛季天数</span></div>
        <div><b>${s.playable}</b><span>可打球日</span></div>
        <div><b>22</b><span>名球员</span></div>`;
      strip.dataset.ready = '1';
    }
  }

  /* ============================================================
   * 主界面
   * ============================================================ */
  function renderMain() {
    const st = Game.state;
    const info = Cal.dayInfo(st.date);
    if (UI.lastDate !== st.date) {
      UI.lastDate = st.date;
      UI.calMonth = st.date.slice(0, 7);
    }
    if (!UI.calMonth) UI.calMonth = st.date.slice(0, 7);

    renderTopbar(st, info);
    renderCalendar(st, info);
    renderDay(st, info);
    renderActions(st, info);
    renderTeamPanel(st);
    renderStandings(st);
    renderFeed(st);
    renderEventPanel(st);
    renderTimeline(st);
    renderRecent(st);
    renderStatsPanel(st);
  }

  /* 左下角：赛季累计球员数据 */
  function renderStatsPanel(st) {
    const el = $('#stats-panel');
    if (!el) return;
    const stats = st.playerStats || {};
    const tab = UI.statTab || 'pts';
    const LABEL = { pts: '得分', reb: '篮板', ast: '助攻' };

    const rows = Object.keys(stats)
      .map(id => {
        const p = st.players[id];
        const s = stats[id];
        return p && s && s.gp > 0 ? { id: Number(id), p, ...s } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b[tab] - a[tab])
      .slice(0, 8);

    el.innerHTML = `
      <div class="panel-head">
        <h3 class="panel-title">球员数据榜</h3>
        <div class="stat-tabs">
          ${['pts', 'reb', 'ast'].map(k => `<button class="stat-tab ${tab === k ? 'is-active' : ''}" data-stat-tab="${k}">${LABEL[k]}</button>`).join('')}
        </div>
      </div>
      <div class="stats-list">
        ${rows.length ? rows.map((r, i) => `
          <div class="stat-row" data-player="${r.id}">
            <span class="stat-rank">${i + 1}</span>
            <span class="stat-name">${esc(r.p.name)}</span>
            <span class="stat-gp">${r.gp} 场</span>
            <b class="stat-val">${r[tab]}</b>
          </div>`).join('') : '<div class="muted" style="font-size:12px;line-height:1.7">还没有比赛数据。<br />打一场车轮战就会开始累计。</div>'}
      </div>
      <div class="stats-foot">赛季累计 · 点球员看属性</div>`;
  }

  function renderRecent(st) {
    const el = $('#recent-panel');
    if (!st.history.length) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    el.hidden = false;
    const rows = st.history.slice(0, 5).map(h => {
      const home = Game.teamById(st, h.homeId);
      const away = Game.teamById(st, h.awayId);
      const involved = h.homeId === 'T1' || h.awayId === 'T1';
      const win = h.winnerId === 'T1';
      const tag = involved
        ? `<span class="res-tag ${win ? 'win' : 'lose'}">${win ? '胜' : '负'}</span>`
        : '<span class="res-tag ai">AI</span>';
      return `<div class="recent-row ${involved ? 'is-mine' : ''}">
        <span class="recent-date">${h.date.slice(5).replace('-', '/')}</span>
        <span class="recent-teams">${esc(home.name)} <b>${h.scoreH} : ${h.scoreA}</b> ${esc(away.name)}</span>
        ${tag}
      </div>`;
    }).join('');
    el.innerHTML = `<h3 class="panel-title">最近战报</h3><div class="recent-list">${rows}</div>`;
  }

  function renderTopbar(st, info) {
    const d = Cal.parseDate(st.date);
    const human = Game.humanTeam(st);
    $('#top-date').textContent = `${d.getMonth() + 1} 月 ${d.getDate()} 日 · 周${WEEK[d.getDay()]}`;
    $('#top-sub').textContent = `${d.getFullYear()} 年 · ${info.period ? info.period.label : '—'}${info.exam ? ' · ' + info.exam.label : ''}`;
    $('#top-record').innerHTML = `战绩 <b>${human.wins}</b> 胜 <b>${human.losses}</b> 负`;
  }

  function renderCalendar(st, info) {
    const [y, m] = UI.calMonth.split('-').map(Number);
    $('#month-label').textContent = `${y} 年 ${m} 月`;
    const cells = Cal.monthCells(UI.calMonth);
    $('#calendar-grid').innerHTML = cells.map(date => {
      if (!date) return '<div class="cal-cell is-out"></div>';
      const i = Cal.dayInfo(date);
      const d = Cal.parseDate(date);
      const classes = ['cal-cell'];
      if (i.inSeason) {
        if (i.exam) classes.push('is-exam');
        else if (i.period && i.period.kind === 'vacation') classes.push('is-vac');
        else if (i.period && i.period.kind === 'stay') classes.push('is-stay');
        else classes.push('is-school');
      } else classes.push('is-out');
      if (i.playable) classes.push('is-playable');
      if (date === st.date) classes.push('is-today');
      if (date < st.date) classes.push('is-past');
      return `<div class="${classes.join(' ')}" title="${esc(date + ' · ' + i.reason)}">${d.getDate()}</div>`;
    }).join('');

    const next = Cal.nextPlayable(st.date, false);
    $('#next-play').innerHTML = next
      ? `<span>下一个打球日</span><b>${next.slice(5).replace('-', '/')}（周${WEEK[Cal.weekdayOf(next)]}）</b>`
      : '<span>本赛季已没有可打球的日子</span><b>—</b>';
  }

  function teacherNoteHtml(comment, compact) {
    if (!comment) return '';
    const initial = comment.name.slice(0, 1);
    return `<div class="teacher-note ${compact ? 'is-compact' : ''}">
      <div class="tn-head">
        <span class="tn-avatar">${esc(initial)}</span>
        <div class="tn-meta"><b>${esc(comment.name)}</b><small>${esc(comment.role)}</small></div>
        <span class="tn-tag">老师点评</span>
      </div>
      <p>“${esc(comment.text)}”</p>
    </div>`;
  }

  function renderDay(st, info) {
    const d = Cal.parseDate(st.date);
    const chips = [];
    if (info.exam) chips.push(`<span class="chip chip-exam">${info.exam.label}第 ${Math.round((d - Cal.parseDate(info.exam.start)) / 86400000) + 1} 天</span>`);
    if (info.period) {
      const cls = info.period.kind === 'vacation' ? 'chip-vac' : info.period.kind === 'stay' ? 'chip-stay' : 'chip-school';
      chips.push(`<span class="chip ${cls}">${esc(info.period.label)}</span>`);
    }
    if (info.playLabel) chips.push(`<span class="chip chip-play">${esc(info.playLabel)}</span>`);

    const isSchool = info.period && info.period.kind === 'school';
    const comment = isSchool ? Game.teacherComment(st, 'day') : null;

    $('#day-panel').innerHTML = `
      <div class="day-head">
        <div>
          <div class="day-date">${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')}</div>
          <div class="day-week">${d.getFullYear()} 年 · 周${WEEK[d.getDay()]}${info.playable ? ' · 可以打球' : ''}</div>
          <div class="day-tags">${chips.join('')}</div>
        </div>
        <div class="day-status ${info.playable ? 'play' : ''}">${info.playable ? 'PLAY DAY' : 'NO GAME'}</div>
      </div>
      <div class="day-reason">${esc(info.reason)}</div>
      ${teacherNoteHtml(comment)}`;
  }

  function renderActions(st, info) {
    const el = $('#actions-panel');
    const canPlay = Game.canStartMatch(st);
    const rows = [];

    if (info.playable) {
      const target = Game.winScoreOf(st, st.date);
      if (!canPlay) {
        rows.push(`<div class="action-row"><button class="action-btn" disabled>
          <span class="action-ico">🚑</span>
          <span><span class="action-main">人不够</span><span class="action-sub">健康球员不足 15 人，先让大家恢复</span></span>
        </button></div>`);
      } else {
        rows.push(`<div class="action-row"><button class="action-btn" data-session="1">
          <span class="action-ico">🏀</span>
          <span><span class="action-main">开始今日车轮战</span>
          <span class="action-sub">先选人分三队 · 45 分钟 · 抢 ${target} 分${target >= 21 ? '（周日）' : ''}</span></span>
          <span class="action-arrow">›</span>
        </button></div>`);
      }
      rows.push(`<div class="action-row"><button class="action-btn" data-train="1">
        <span class="action-ico">🎯</span>
        <span><span class="action-main">全班加练</span><span class="action-sub">选择一个属性，到场球员 +1（有几率 +2）</span></span>
        <span class="action-arrow">›</span>
      </button></div>`);
      rows.push(`<div class="action-row"><button class="action-btn" data-rest="1">
        <span class="action-ico">😴</span>
        <span><span class="action-main">今天不打了</span><span class="action-sub">大家休息，体力 +6，推进到明天</span></span>
        <span class="action-arrow">›</span>
      </button></div>`);
    } else {
      rows.push(`<div class="action-row"><button class="action-btn" data-rest="1">
        <span class="action-ico">⏭</span>
        <span><span class="action-main">休息，推进一天</span><span class="action-sub">今天没有球打，体力照常恢复</span></span>
        <span class="action-arrow">›</span>
      </button></div>`);
      const next = Cal.nextPlayable(st.date, false);
      if (next) {
        rows.push(`<div class="action-row"><button class="action-btn" data-skip="1">
          <span class="action-ico">⏩</span>
          <span><span class="action-main">快进到 ${next.slice(5).replace('-', '/')}</span><span class="action-sub">直接跳到下一个打球日</span></span>
          <span class="action-arrow">›</span>
        </button></div>`);
      }
    }
    el.innerHTML = rows.join('');
  }

  function renderTeamPanel(st) {
    const human = Game.humanTeam(st);
    const last = Game.lastTeamPlayers(st).sort((a, b) => b.overall - a.overall);
    const body = last.length
      ? `<div class="roster-list">
          ${last.map(p => `
            <div class="roster-row" data-player="${p.id}">
              <span class="roster-ovr">${p.overall}</span>
              <div>
                <div class="roster-name">${esc(p.name)} ${p.injury > 0 ? `<span class="injury-tag">伤 ${p.injury}天</span>` : ''}</div>
                <div style="font-size:10.5px;color:var(--dim)">${p.pos} · ${p.h}cm</div>
              </div>
              <div class="stamina ${staminaClass(p.stamina)}" title="体力 ${Math.round(p.stamina)}"><i style="width:${Math.max(4, p.stamina)}%"></i></div>
            </div>`).join('')}
        </div>
        <div class="muted" style="font-size:11px;margin-top:10px">上一场出场阵容 · 下一场重新选人</div>`
      : `<div class="muted" style="font-size:12px;line-height:1.7">还没有打过比赛。<br />每个可打球日都可以约战，比赛前从到场的 15 人里临时组队。</div>`;
    $('#team-panel').innerHTML = `
      <div class="team-head">
        <div class="team-name">${esc(human.name)}</div>
        <div class="team-record">${human.wins} 胜 ${human.losses} 负</div>
      </div>
      ${body}`;
  }

  function renderStandings(st) {
    const rows = Game.standings(st);
    $('#standings-panel').innerHTML = `
      <h3 class="panel-title">积分榜</h3>
      <div class="standings-table">
        ${rows.map((t, i) => `
          <div class="stand-row ${t.human ? 'is-human' : ''}">
            <span class="stand-rank">${i + 1}</span>
            <span class="stand-name">${esc(t.name)}</span>
            <span class="stand-wl">${t.wins}-${t.losses}</span>
            <span class="stand-diff">${t.pf - t.pa >= 0 ? '+' : ''}${t.pf - t.pa}</span>
          </div>`).join('')}
      </div>`;
  }

  function renderFeed(st) {
    const items = st.log.slice(0, 12).map(x => {
      const date = x.date ? x.date.slice(5).replace('-', '/') : '';
      return `<li class="${x.kind || ''}"><time>${date}</time>${esc(x.text)}</li>`;
    });
    $('#feed-list').innerHTML = items.join('') || '<li class="muted">暂无动态</li>';
  }

  function renderEventPanel(st) {
    const ev = st.lastEvent;
    const panel = $('#event-panel');
    if (ev && ev.date === st.date) {
      panel.hidden = false;
      panel.innerHTML = `<div class="event-title">${esc(ev.title)}</div><div class="event-text">${esc(ev.text)}</div>`;
    } else {
      panel.hidden = true;
      panel.innerHTML = '';
    }
  }

  function renderTimeline(st) {
    const start = TBA.SEASON.start, end = TBA.SEASON.end;
    const total = Cal.dayDiff(start, end) + 1;
    const segs = TBA.SEASON.periods.map((p, i) => {
      const days = Cal.dayDiff(p.start, p.end) + 1;
      const label = p.kind === 'stay' ? '留校' : p.kind === 'vacation' ? p.label : (i < 4 ? '秋季学期' : '春季学期');
      const show = days / total > 0.06;
      return `<div class="seg seg-${p.kind}" style="width:${(days / total * 100).toFixed(2)}%" title="${esc(p.label + ' ' + p.start + ' → ' + p.end)}">${show ? label : ''}</div>`;
    }).join('');
    const exams = TBA.SEASON.exams.map(e => {
      const left = Cal.dayDiff(start, e.start) / (total - 1) * 100;
      const w = e.days / (total - 1) * 100;
      return `<span class="exam-tick" style="left:${left.toFixed(2)}%;width:${w.toFixed(2)}%" title="${esc(e.label + ' ' + e.start)}"></span>`;
    }).join('');
    const todayPct = Math.max(0, Math.min(100, Cal.dayDiff(start, st.date) / (total - 1) * 100));
    $('#timeline-panel').innerHTML = `
      <div class="timeline-head">
        <span>赛季进度 <b>${st.date}</b></span>
        <span>第 ${Cal.dayDiff(start, st.date) + 1} / ${total} 天</span>
      </div>
      <div class="timeline">${segs}${exams}<i class="marker" style="left:${todayPct.toFixed(2)}%"></i></div>
      <div class="timeline-labels">
        <span>2025.07.02 高三开局</span><span>2026.02 寒假冲刺</span><span>2026.06.09 高考收官</span>
      </div>`;
  }

  /* ============================================================
   * 每日车轮战：每天开始时先选人分三队，输的下场、赢的留场
   * ============================================================ */
  function openDayBuilder() {
    const st = Game.state;
    const human = Game.humanTeam(st);
    const pool = Game.buildPool(st);
    const info = Cal.dayInfo(st.date);
    const summary = Game.poolSummary(pool);
    const teamIds = st.teams.map(t => t.id);
    const leaders = st.teams.map(t => t.core);
    const candidates = pool.filter(p => leaders.indexOf(p.id) < 0);

    if (candidates.length < (CFG.teamSize - 1) * CFG.teamsPerDay) {
      openModal(`${modalHead('人到齐了吗？', '到场球员不足')}
        <p class="muted">今天只来了 ${pool.length} 个人，凑不齐三支 ${CFG.teamSize} 人队。先训练或者换一天吧。</p>
        <div class="modal-actions"><button class="btn btn-primary" data-close="1">知道了</button></div>`);
      return;
    }

    const teams = {};
    st.teams.forEach(t => { teams[t.id] = [t.core]; });

    // 三队蛇形轮选：A B C C B A A B C ...
    const order = TBA.utils.shuffle(teamIds);
    const turns = [];
    for (let r = 0; r < CFG.teamSize - 1; r++) {
      const seq = r % 2 === 0 ? order.slice() : order.slice().reverse();
      seq.forEach(id => turns.push(id));
    }
    let turn = 0;
    const taken = new Set();
    let busy = false;

    const isHumanTurn = () => turns[turn] === human.id;
    const done = () => turn >= turns.length;
    const nameOf = id => st.teams.find(t => t.id === id).name;

    const slotsHtml = teamId => {
      const ids = teams[teamId];
      const out = [];
      for (let i = 0; i < CFG.teamSize; i++) {
        const id = ids[i];
        if (id) {
          const p = st.players[id];
          out.push(`<div class="slot ${p.core ? 'is-leader' : 'is-filled'}">
            <span class="slot-ovr">${p.overall}</span>
            <span class="slot-name">${esc(p.name)}</span>
            <em>${p.core ? '领袖' : (p.pos === '锋线' ? '锋' : '卫')}</em>
          </div>`);
        } else {
          out.push('<div class="slot is-empty"><span>待选</span></div>');
        }
      }
      return out.join('');
    };

    const cardHtml = p => {
      const enabled = isHumanTurn() && !busy && !done();
      return `<button class="pick-card" data-pool="${p.id}" ${enabled ? '' : 'disabled'}>
        <span class="pick-ovr">${p.overall}</span>
        <span class="pick-main">
          <span class="pick-name">${esc(p.name)}</span>
          <span class="pick-sub">${p.pos} · ${p.h}cm · 体力 ${Math.round(p.stamina)}</span>
        </span>
        ${p.role === TBA.GUEST_ROLE ? '<em class="slot-tag">客串</em>' : ''}
      </button>`;
    };

    const renderBody = () => {
      const modal = document.querySelector('#modal-root .modal');
      if (!modal) return;
      teamIds.forEach(id => {
        const el = modal.querySelector(`#slots-${id}`);
        if (el) el.innerHTML = slotsHtml(id);
      });
      const remain = pool.filter(p => !taken.has(p.id) && leaders.indexOf(p.id) < 0);
      modal.querySelector('#pool-count').textContent = `还剩 ${remain.length} 人可选`;
      modal.querySelector('#pool-grid').innerHTML = remain.map(cardHtml).join('');
      const turnEl = modal.querySelector('#build-turn');
      if (done()) turnEl.innerHTML = '<b class="is-ready">三队分好，开始车轮战</b>';
      else if (isHumanTurn()) turnEl.innerHTML = `轮到你选人 <b>还差 ${CFG.teamSize - teams[human.id].length} 人</b>`;
      else turnEl.innerHTML = `${esc(nameOf(turns[turn]))} 选择中…`;
      const btn = modal.querySelector('#btn-start-session');
      btn.disabled = !done();
      btn.textContent = done() ? '开始车轮战' : '选人中…';
    };

    const aiStep = () => {
      if (done()) return;
      const teamId = turns[turn];
      if (teamId === human.id) return;
      busy = true;
      renderBody();
      setTimeout(() => {
        const remain = pool.filter(p => !taken.has(p.id) && leaders.indexOf(p.id) < 0);
        const pick = Game.aiPick(st, remain, teams[teamId]);
        if (pick) { teams[teamId].push(pick.id); taken.add(pick.id); turn++; }
        busy = false;
        renderBody();
        if (!done() && turns[turn] !== human.id) aiStep();
      }, 420);
    };

    const teamBlocks = teamIds.map(id => {
      const t = st.teams.find(x => x.id === id);
      return `<div class="build-team">
        <div class="build-team-head"><b>${esc(t.name)}</b>${t.human ? '<span class="chip chip-live">你的队伍</span>' : ''}</div>
        <div class="build-slots" id="slots-${id}"></div>
      </div>`;
    }).join('');

    openModal(`${modalHead('今日车轮战 · 选人分三队', `${Cal.labelDate(st.date)} · 45 分钟 · 抢 ${Game.winScoreOf(st, st.date)} 分`)}
      <div class="build-meta">
        <span class="chip ${info.exam ? 'chip-exam' : 'chip-school'}">${info.exam ? '考试期间 · 客串球员到场' : '常规到场'}</span>
        <span class="muted">今天来了 ${summary.total} 人：锋线 ${summary.forwards} · 后卫 ${summary.guards}${summary.guests ? `（含客串 ${summary.guests}）` : ''}；三队蛇形轮选</span>
      </div>
      <div class="build-teams three">${teamBlocks}</div>
      <div class="build-turn" id="build-turn"></div>
      <div class="pool-head"><h3 class="panel-title">现场球员 <span class="muted" id="pool-count"></span></h3></div>
      <div class="pick-grid" id="pool-grid"></div>
      <div class="modal-actions is-sticky">
        <button class="btn btn-ghost" data-close="1">取消</button>
        <button class="btn btn-primary" id="btn-start-session" disabled>选人中…</button>
      </div>`, { wide: true });

    const modal = document.querySelector('#modal-root .modal');
    if (!modal) return;

    modal.addEventListener('click', e => {
      const card = e.target.closest('[data-pool]');
      if (!card || card.disabled || busy || done() || !isHumanTurn()) return;
      const id = Number(card.dataset.pool);
      if (taken.has(id) || leaders.indexOf(id) >= 0) return;
      teams[human.id].push(id);
      taken.add(id);
      turn++;
      renderBody();
      if (!done() && turns[turn] !== human.id) aiStep();
    });

    modal.addEventListener('click', e => {
      if (!e.target.closest('#btn-start-session') || !done()) return;
      const session = Game.startSession(st, teams);
      if (!session) return;
      Game.save(st);
      openSession();
    });

    renderBody();
    if (turns[turn] !== human.id) aiStep();
  }

  /* ---------------- 车轮战进行中 ---------------- */
  function sessionTeamBlock(st, teamId, tag) {
    const t = Game.teamById(st, teamId);
    const ids = (st.session && st.session.teams[teamId]) || [];
    return `<div class="session-team">
      <div class="session-team-head"><b>${esc(t.name)}</b><span>${esc(tag)}</span></div>
      ${ids.map(id => {
        const p = st.players[id];
        return `<div class="session-player"><span class="sp-ovr">${p.overall}</span><span class="sp-name">${esc(p.name)}</span><span class="sp-pos">${p.pos}</span></div>`;
      }).join('')}
    </div>`;
  }

  function openSession() {
    const st = Game.state;
    const s = st.session;
    if (!s) return;

    openModal(`
      <div class="modal-head">
        <div><h3>今日车轮战</h3><p>${Cal.labelDate(st.date)} · 45 分钟 · 抢 ${s.target} 分${s.target >= 21 ? '（周日）' : ''}</p></div>
      </div>
      <div id="session-body"></div>
      <div class="modal-actions is-sticky">
        <button class="btn btn-primary" id="btn-session-play">开打</button>
        <button class="btn btn-ghost" id="btn-session-auto">自动打完</button>
        <button class="btn btn-primary" id="btn-session-end" hidden>结束今天</button>
      </div>`, { wide: true, onClose: render });

    const modal = document.querySelector('#modal-root .modal');
    if (!modal) return;

    const paint = () => {
      const body = modal.querySelector('#session-body');
      if (!body) return;
      const [a, b] = s.court;
      const pct = Math.min(100, Math.round(s.elapsed / s.limit * 100));
      const results = s.games.slice().reverse().map(g => {
        const w = Game.teamById(st, g.winnerId);
        const l = Game.teamById(st, g.loserId);
        return `<li><span class="sr-no">${g.no}</span><span class="sr-teams">${esc(w.name)} <b>${Math.max(g.scoreH, g.scoreA)}:${Math.min(g.scoreH, g.scoreA)}</b> ${esc(l.name)}</span><span class="sr-min">${g.minutes}′</span></li>`;
      }).join('');

      const last = s.games[s.games.length - 1];
      let detailHtml = '<div class="game-detail is-empty">打完一场后，这里会显示球员数据和逐回合赛况。</div>';
      if (last && last.detail) {
        const d = last.detail;
        const home = Game.teamById(st, last.homeId);
        const away = Game.teamById(st, last.awayId);
        const boxTable = (team, rows) => `
          <div class="gd-box">
            <div class="gd-box-head">${esc(team.name)}</div>
            <table class="box-table">
              <thead><tr><th>球员</th><th>分</th><th>板</th><th>助</th></tr></thead>
              <tbody>${rows.map(r => `<tr class="${d.mvp.id === r.id ? 'is-mvp' : ''}"><td>${esc(r.name)}</td><td>${r.pts}</td><td>${r.reb}</td><td>${r.ast}</td></tr>`).join('')}</tbody>
            </table>
          </div>`;
        detailHtml = `
          <div class="game-detail">
            <div class="gd-title">
              <span>第 ${last.no} 场 · ${esc(home.name)} <b>${last.scoreH} : ${last.scoreA}</b> ${esc(away.name)}</span>
              <span class="gd-mvp">MVP ${esc(d.mvp.name)}（${d.mvp.pts} 分 ${d.mvp.reb} 板）</span>
            </div>
            <div class="gd-boxes">${boxTable(home, d.boxH)}${boxTable(away, d.boxA)}</div>
            <details class="gd-plays" open>
              <summary>逐回合赛况（${d.plays.length} 次进攻）</summary>
              <ol class="play-list">
                ${d.plays.map(p => `<li><span class="pl-no">${p.no}</span><span class="pl-text">${esc(p.text)}</span><span class="pl-score">${p.score}</span></li>`).join('')}
              </ol>
            </details>
          </div>`;
      }

      const waitingTeam = Game.teamById(st, s.waiting);
      const waitingNames = (s.teams[s.waiting] || []).map(id => st.players[id].name).join(' · ');

      body.innerHTML = `
        <div class="session-clock">
          <div class="sc-top"><span>已打 <b>${s.elapsed}</b> / ${s.limit} 分钟</span><span>${s.games.length} 场 · ${s.finished ? '时间到' : '继续'}</span></div>
          <div class="sc-bar"><i style="width:${pct}%"></i></div>
        </div>
        <div class="session-court">
          ${sessionTeamBlock(st, a, '场上')}
          <div class="session-vs">VS</div>
          ${sessionTeamBlock(st, b, '场上')}
        </div>
        <div class="session-waiting-bar">
          <span class="sw-label">场下等待</span>
          <b>${esc(waitingTeam.name)}</b>
          <span class="sw-names">${esc(waitingNames)}</span>
        </div>
        ${detailHtml}
        <div class="session-results">
          <h4>今日战报</h4>
          <ul class="session-log">${results || '<li class="muted">还没有开打</li>'}</ul>
        </div>`;

      const play = modal.querySelector('#btn-session-play');
      const auto = modal.querySelector('#btn-session-auto');
      const end = modal.querySelector('#btn-session-end');
      play.hidden = s.finished;
      auto.hidden = s.finished;
      end.hidden = !s.finished;
      play.textContent = `开打第 ${s.games.length + 1} 场`;
    };

    const finish = () => {
      const summary = Game.endSession(st);
      closeModal();
      render();
      if (summary) openSessionSummary(summary);
    };

    modal.addEventListener('click', e => {
      if (e.target.closest('#btn-session-play')) {
        if (!st.session || st.session.finished) return;
        Game.sessionPlay(st);
        Game.save(st);
        paint();
        return;
      }
      if (e.target.closest('#btn-session-auto')) {
        const step = () => {
          if (!st.session || st.session.finished) { paint(); return; }
          Game.sessionPlay(st);
          Game.save(st);
          paint();
          if (st.session && !st.session.finished) setTimeout(step, 320);
        };
        step();
        return;
      }
      if (e.target.closest('#btn-session-end')) finish();
    });

    paint();
  }

  function openSessionSummary(summary) {
    const st = Game.state;
    const rows = summary.games.map(g => {
      const w = Game.teamById(st, g.winnerId);
      const l = Game.teamById(st, g.loserId);
      return `<div class="recent-row is-mine"><span class="recent-date">${g.no}</span>
        <span class="recent-teams">${esc(w.name)} <b>${Math.max(g.scoreH, g.scoreA)} : ${Math.min(g.scoreH, g.scoreA)}</b> ${esc(l.name)}</span>
        <span class="muted">${g.minutes}′</span></div>`;
    }).join('');
    openModal(`${modalHead('车轮战结束', `${summary.elapsed} 分钟 · ${summary.games.length} 场 · 大娘队 ${summary.wins} 胜 ${summary.losses} 负`)}
      <div class="recent-list">${rows}</div>
      <div class="modal-actions is-sticky"><button class="btn btn-primary" data-close="1">收工</button></div>`, { wide: true });
  }

  function openTraining() {
    openModal(`${modalHead('全队训练', '选择今天的训练重点')}
      <div class="train-grid">
        ${ATTR_KEYS.map(k => `<button class="train-btn" data-train-attr="${k}">
          <b>${ATTR_CN[k]}</b><span>全队 ${ATTR_CN[k]} +1（25% 几率 +2），消耗体力 8</span>
        </button>`).join('')}
      </div>
      <div class="modal-actions"><button class="btn btn-ghost" data-close="1">取消</button></div>`);
  }

  function openPlayer(id) {
    const st = Game.state;
    const p = st.players[id];
    if (!p) return;
    openModal(`${modalHead(p.name, `${p.role} · ${p.pos} · ${p.h}cm / ${p.w}kg`)}
      <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
        <div class="pc-ovr" style="font-size:52px">${p.overall}<small>OVR</small></div>
        <div>
          <div class="pc-tags">${posChip(p.pos)}${p.core ? '<span class="chip chip-live">建队核心</span>' : ''}</div>
          <div style="margin-top:8px;font-size:13px"><b style="color:var(--orange-2)">${esc(p.trait || '无特性')}</b><span class="muted"> · ${esc(p.traitDesc || '')}</span></div>
        </div>
      </div>
      <div class="attr-grid">
        ${ATTR_KEYS.map(k => attrLine(k, p.attrs[k])).join('')}
      </div>
      <div style="margin-top:16px;display:flex;gap:18px;font-size:12px;color:var(--muted)">
        <span>体力 ${Math.round(p.stamina)}</span>
        <span>${p.injury > 0 ? `伤停 ${p.injury} 天` : '健康'}</span>
      </div>`);
  }

  /* ============================================================
   * 规则 / 菜单
   * ============================================================ */
  function openRules() {
    openModal(`${modalHead('规则与设定', '高三这一年 · 来自 schedule.md 与球员信息表.et')}
      <div class="rules-section">
        <h4>零、背景</h4>
        <p>故事发生在<strong>高三学年</strong>：2025 年 7 月暑假留校开始补课，2026 年 6 月 9 日高考结束，赛季也在这一天落幕。</p>
        <h4>一、赛历（schedule.md）</h4>
        <p>赛季从 <code>2025-07-02</code> 到 <code>2026-06-09</code>。</p>
        <ul>
          <li>暑假 7.12—8.10，寒假 2.11—2.24：球场放假。</li>
          <li>暑假留校 7.2—7.11、8.11—8.30；寒假留校 2.5—2.10、2.25—3.1：周二、周四、周六打球，最后一天不打。</li>
          <li>正常上学周：周二、周五下午第一节、周四下午第二节有体育课，周日照常打球。</li>
          <li>小考试 3 天、大考试 6 天：<strong>考试期间每天晚上都能打球</strong>，而且客串球员只在这时出现。</li>
        </ul>
        <img class="rules-img" src="rules.png" alt="联盟规则原图" />
        <h4>二、每日车轮战（本轮重点）</h4>
        <ul>
          <li><strong>每天一开始先选人</strong>：到场的 15 人分成三支球队，每队 5 人（领袖 + 4 人），三队蛇形轮选。</li>
          <li>选完就开始车轮战：<strong>两方先打，输的一方下场，场下那队上来，赢的留在场上</strong>，一直打到 45 分钟用完为止。</li>
          <li>分数制：<strong>平日抢 7 分，周日抢 21 分</strong>，先到目标分的一方获胜。</li>
          <li>每队 5 人里自动排 3 人首发，领袖必定首发；单场时间按攻防回合折算。</li>
          <li>到场规则：锋线全来，后卫随机来，客串球员只在考试期间出现，总数固定 15 人。</li>
          <li>比赛记录照常计入积分榜；建队核心不会受伤。</li>
          <li>交易市场：暂未实现，排在后续版本计划里。</li>
        </ul>
        <h4>三、比赛与养成</h4>
        <ul>
          <li>球员属性由身高、体重、位置和名字稳定生成，特性来自「球场特性」列。</li>
          <li>车轮战里每场消耗体力，打满 45 分钟后统一结算；体力低于 28 时有受伤风险，伤员不会出现在下一次的到场名单里。</li>
          <li>「全班加练」会提升所有健康球员；比赛日只能做一件事：车轮战、加练或休息。</li>
        </ul>
        <h4>四、老师点评</h4>
        <p>正常上学的非考试日，按星期会有一位老师点评球队；赛后结算里还会补一句输赢不同的点评。</p>
        <h4>五、数据说明</h4>
        <p>22 名球员的数据来自球员信息表.et；六位老师作为剧情 NPC 出现在随机事件里。这一轮只开放「大娘」作为主角，奶龙与走刀暂未解锁。</p>
      </div>
      <div class="modal-actions"><button class="btn btn-primary" data-close="1">知道了</button></div>`, { wide: true });
  }

  function openMenu() {
    openModal(`${modalHead('菜单', '赛季进度会自动保存在本地')}
      <div class="modal-actions" style="flex-direction:column;align-items:stretch">
        <button class="btn btn-ghost btn-block" data-close="1">继续游戏</button>
        <button class="btn btn-ghost btn-block" id="btn-back-title">保存并回到标题</button>
        <button class="btn btn-ghost btn-block" id="btn-restart">重新开始（清空存档）</button>
      </div>`);
    $('#btn-back-title').addEventListener('click', () => {
      Game.save(Game.state);
      closeModal();
      Game.state = null;
      show('screen-title');
      renderTitle();
    });
    $('#btn-restart').addEventListener('click', () => {
      closeModal(() => {
        Game.clearSave();
        Game.state = null;
        show('screen-title');
        renderTitle();
      });
    });
  }

  /* ============================================================
   * 结算页
   * ============================================================ */
  function renderEnd() {
    const st = Game.state;
    const sum = Game.seasonSummary(st);
    const human = sum.human;
    const games = human.wins + human.losses;
    const champion = sum.champion;
    const isChamp = champion.id === human.id;

    const recent = st.history.slice(0, 10).map(h => {
      const home = Game.teamById(st, h.homeId);
      const away = Game.teamById(st, h.awayId);
      const win = h.winnerId === human.id;
      const involved = h.homeId === human.id || h.awayId === human.id;
      return `<div class="roster-row" style="${involved ? 'border-color:rgba(255,122,24,.25)' : ''}">
        <span class="roster-ovr" style="width:44px">${h.date.slice(5)}</span>
        <span class="roster-name">${esc(home.name)} ${h.scoreH} : ${h.scoreA} ${esc(away.name)}</span>
        <span style="margin-left:auto;font-size:11px;color:${win && involved ? 'var(--green)' : 'var(--dim)'}">${involved ? (win ? '胜' : '负') : 'AI'}</span>
      </div>`;
    }).join('');

    $('#end-shell').innerHTML = `
      <div class="end-hero">
        <p class="eyebrow">2025 — 2026 赛季结束</p>
        <h1>${isChamp ? '冠 军' : '赛 季 落 幕'}<em>${isChamp ? ' · 大娘队' : ''}</em></h1>
        <p>${isChamp ? '你把冠军奖杯留在了大娘队的更衣柜里。' : `冠军是 ${esc(champion.name)}。下个赛季，从选秀重新开始。`}</p>
      </div>
      <div class="end-cards">
        <div class="panel end-card"><b>${human.wins}</b><span>胜场</span></div>
        <div class="panel end-card"><b>${human.losses}</b><span>负场</span></div>
        <div class="panel end-card"><b>${champion.name === human.name ? '1' : '—'}</b><span>冠军</span></div>
      </div>
      <div class="panel">
        <h3 class="panel-title">最终排名</h3>
        <div class="standings-table">
          ${sum.standings.map((t, i) => `<div class="stand-row ${t.human ? 'is-human' : ''}">
            <span class="stand-rank">${i + 1}</span><span class="stand-name">${esc(t.name)}</span>
            <span class="stand-wl">${t.wins}-${t.losses}</span><span class="stand-diff">${t.pf - t.pa >= 0 ? '+' : ''}${t.pf - t.pa}</span>
          </div>`).join('')}
        </div>
      </div>
      <div class="panel" style="margin-top:16px">
        <h3 class="panel-title">最后十场</h3>
        <div class="roster-list">${recent || '<div class="muted">没有比赛记录</div>'}</div>
      </div>
      <div class="end-actions">
        <button class="btn btn-primary" id="btn-end-new">再来一季</button>
        <button class="btn btn-ghost" id="btn-end-rules">查看规则</button>
        <button class="btn btn-ghost" id="btn-end-title">回到标题</button>
      </div>`;
    if (!isChamp) {
      $('#end-shell').querySelector('h1').style.color = 'var(--text)';
    }
  }

  /* ============================================================
   * 事件绑定
   * ============================================================ */
  function bind() {
    $('#btn-new').addEventListener('click', () => {
      Game.create();
      render();
    });
    $('#btn-continue').addEventListener('click', () => {
      const st = Game.load();
      if (st) render(); else renderTitle();
    });
    $('#btn-rules').addEventListener('click', openRules);

    // 主界面
    document.addEventListener('click', e => {
      if (e.target.closest('[data-session]')) {
        if (e.target.closest('#modal-root')) return;
        openDayBuilder();
        return;
      }
      if (e.target.closest('[data-train]')) { openTraining(); return; }
      if (e.target.closest('[data-train-attr]')) {
        const attr = e.target.closest('[data-train-attr]').dataset.trainAttr;
        closeModal();
        Game.train(Game.state, attr);
        render();
        return;
      }
      if (e.target.closest('[data-rest]')) {
        closeModal();
        Game.rest(Game.state);
        render();
        return;
      }
      if (e.target.closest('[data-skip]')) {
        Game.skip(Game.state);
        render();
        return;
      }
      const tabBtn = e.target.closest('[data-stat-tab]');
      if (tabBtn) {
        UI.statTab = tabBtn.dataset.statTab;
        renderStatsPanel(Game.state);
        return;
      }
      const rosterRow = e.target.closest('[data-player]');
      if (rosterRow) { openPlayer(Number(rosterRow.dataset.player)); return; }
    });

    $('#btn-prev-month').addEventListener('click', () => {
      UI.calMonth = shiftMonth(UI.calMonth, -1);
      renderCalendar(Game.state, Cal.dayInfo(Game.state.date));
    });
    $('#btn-next-month').addEventListener('click', () => {
      UI.calMonth = shiftMonth(UI.calMonth, 1);
      renderCalendar(Game.state, Cal.dayInfo(Game.state.date));
    });
    $('#btn-rules-main').addEventListener('click', openRules);
    $('#btn-menu').addEventListener('click', openMenu);

    // 结算页（动态元素用事件委托）
    $('#screen-end').addEventListener('click', e => {
      if (e.target.closest('#btn-end-new')) {
        Game.clearSave();
        Game.create();
        render();
      } else if (e.target.closest('#btn-end-rules')) {
        openRules();
      } else if (e.target.closest('#btn-end-title')) {
        Game.state = null;
        show('screen-title');
        renderTitle();
      }
    });

    // Esc 关闭弹窗
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeModal(modalOnClose);
    });
  }

  function shiftMonth(ym, delta) {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1, 12);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  /* ============================================================
   * 启动
   * ============================================================ */
  function init() {
    bind();
    renderTitle();

    // 演示模式：?demo=main / ?demo=team / ?demo=session / ?demo=school / ?demo=end
    try {
      const params = new URLSearchParams(global.location.search);
      const demo = params.get('demo');
      if (demo) {
        Game.create();
        const st = Game.state;

        const skipToPlayable = () => {
          Game.skip(st);
          return Cal.dayInfo(st.date).playable;
        };

        const skipToSchool = requirePlayable => {
          let guard = 0;
          while (st.phase === 'season' && guard++ < 400) {
            const info = Cal.dayInfo(st.date);
            const isSchool = info.period && info.period.kind === 'school';
            const weekday = info.weekday >= 1 && info.weekday <= 5;
            if (isSchool && weekday && (!requirePlayable || info.playable)) break;
            Game.rest(st);
          }
        };

        const playTodaySession = () => {
          const day = Game.buildDayTeams(st);
          if (!Game.startSession(st, day.teams)) return null;
          let guard = 0;
          while (st.session && !st.session.finished && guard++ < 40) Game.sessionPlay(st);
          return Game.endSession(st);
        };

        if (demo === 'school') {
          skipToSchool(true);
          Game.save(st);
          render();
          return;
        }

        if (demo === 'team') {
          skipToPlayable();
          Game.save(st);
          render();
          openDayBuilder();
          return;
        }

        if (demo === 'session') {
          skipToPlayable();
          const day = Game.buildDayTeams(st);
          Game.startSession(st, day.teams);
          Game.sessionPlay(st);
          Game.sessionPlay(st);
          Game.save(st);
          render();
          return;
        }

        if (demo === 'schoolmatch') {
          skipToSchool(true);
          playTodaySession();
          Game.save(st);
          render();
          return;
        }

        const playSeason = () => {
          let guard = 0;
          while (st.phase === 'season' && guard++ < 400) {
            const info = Cal.dayInfo(st.date);
            if (info.playable && Game.canStartMatch(st)) {
              const summary = playTodaySession();
              if (!summary) Game.rest(st);
            } else {
              Game.rest(st);
            }
          }
        };

        if (demo === 'end') {
          playSeason();
          Game.save(st);
          render();
          return;
        }

        if (demo === 'main') {
          skipToPlayable();
          playTodaySession();
          skipToPlayable();
          Game.save(st);
          render();
          return;
        }

        Game.save(st);
        render();
        return;
      }
    } catch (e) { /* 演示模式失败时按正常流程走 */ }

    if (Game.hasSave()) {
      const st = Game.load();
      if (st) {
        render();
        return;
      }
    }
    show('screen-title');
  }

  // 自动读档：有存档时进入游戏；没有则停在标题页
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.TBA_UI = { render, show, openModal, closeModal };
})(typeof window !== 'undefined' ? window : globalThis);
