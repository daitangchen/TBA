/*!
 * TBA 模拟器 · 界面层
 */
(function (global) {
  'use strict';
  const TBA = global.TBA;
  const Game = TBA.game;
  const Draft = TBA.draft;
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
    draftTimer: null,
    draftBusy: false,
    summaryShown: false
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
    if (st.phase === 'draft') { show('screen-draft'); renderDraft(); runDraft(); return; }
    if (st.phase === 'end') { show('screen-end'); renderEnd(); return; }
    show('screen-main');
    renderMain();
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
      : '第一次踏上球场？先从选秀大会开始。';
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
   * 选秀页
   * ============================================================ */
  function renderDraft() {
    const st = Game.state;
    const d = st.draft;
    if (!d) return;
    UI.summaryShown = false;

    $('#draft-eyebrow').textContent = `${Cal.labelDate(st.date)} · ${d.round === 1 ? '建队选秀' : '中期选秀'}`;
    $('#draft-title').textContent = d.round === 1 ? '选秀大会' : '中期选秀大会';

    const human = st.teams.find(t => t.human);
    $('#draft-batches').innerHTML = ['A', 'B', 'C'].map(b => {
      const tid = d.batches[b];
      const team = st.teams.find(t => t.id === tid);
      return `<div class="batch-pill ${team.human ? 'is-human' : ''}">
        <b>${b}</b>
        <div><span>${esc(team.name)}</span><small>${team.human ? '你的顺位批次' : (d.round === 2 ? '按战绩分配' : '抽签结果')}</small></div>
      </div>`;
    }).join('');

    $('#draft-counter').textContent = `${d.picks.length} / ${d.seq.length} 签`;

    // 选秀顺位记录
    const slot = Draft.currentSlot(st);
    const logEl = $('#draft-log');
    const entries = d.log.map(x => {
      const team = st.teams.find(t => t.id === x.teamId);
      return `<li class="pick-entry ${x.locked ? 'is-locked' : ''}">
        <span class="pick-no">${x.pickNo}</span>
        <span class="chip">${x.batch || (x.text.match(/\[(.)\]/) || [])[1] || '?'}</span>
        <span class="pick-team">${esc(team.name)}</span>
        <span class="pick-player">${esc(st.players[x.playerId].name)}</span>
      </li>`;
    });
    if (slot) {
      const team = st.teams.find(t => t.id === slot.teamId);
      const who = d.stage === 'lock' ? '选秀尚未开始' : (team.human ? '轮到你了' : '选择中…');
      entries.push(`<li class="pick-entry is-current">
        <span class="pick-no">${d.picks.length + 1}</span>
        <span class="chip">${slot.batch}</span>
        <span class="pick-team">${esc(team.name)}</span>
        <span class="pick-player">${who}</span>
      </li>`);
    }
    logEl.innerHTML = entries.join('');
    logEl.scrollTop = logEl.scrollHeight;

    // 锁定阶段
    const lockEl = $('#draft-lockpanel');
    if (d.stage === 'lock') {
      const prevIds = ((d.previous && d.previous.rosterAfter && d.previous.rosterAfter[human.id]) || []);
      const banned = d.previous ? d.previous.firstPick[human.id] : null;
      const allowed = prevIds.filter(id => id !== banned);
      lockEl.innerHTML = `<div class="panel lock-panel">
        <h3 class="panel-title">锁定球员 <span class="muted">可选 0—1 人</span></h3>
        <p class="muted" style="font-size:12px;line-height:1.6">锁定上一轮自己阵中的一名球员，他会在本轮直接充当你的第一顺位。</p>
        <div class="lock-list">
          ${allowed.map(id => {
            const p = st.players[id];
            return `<button class="lock-btn" data-lock="${id}">
              <span class="roster-ovr">${p.overall}</span>
              <span><b>${esc(p.name)}</b><br /><small class="muted">${p.pos} · ${p.h}cm</small></span>
              <span style="margin-left:auto" class="muted">锁定</span>
            </button>`;
          }).join('')}
          ${banned ? `<div class="muted" style="font-size:11px">上一轮第一顺位 ${esc(st.players[banned].name)} 不可锁定</div>` : ''}
        </div>
        <button class="btn btn-ghost btn-block" data-lock="0">放弃锁定，按正常顺位选</button>
      </div>`;
    } else {
      lockEl.innerHTML = '';
    }

    // 球员池
    const poolEl = $('#draft-pool');
    const isHumanTurn = d.stage === 'pick' && slot && st.teams.find(t => t.id === slot.teamId).human;
    $('#pool-count').textContent = `${d.pool.length} 人待选`;
    $('#pool-legend').innerHTML = d.stage === 'lock'
      ? '<span class="chip chip-live">锁定阶段 · 先做决定</span>'
      : isHumanTurn
        ? '<span class="chip chip-live">轮到你了，点击选择</span>'
        : '<span class="chip">等待其他球队选择…</span>';

    if (d.stage === 'lock') {
      poolEl.innerHTML = `<div class="panel" style="grid-column:1/-1;text-align:center;padding:40px 20px">
        <h3 style="margin-bottom:8px">先决定是否锁定球员</h3>
        <p class="muted">规则：至多锁定一名，且不能是上一轮自己的第一顺位。</p>
      </div>`;
    } else {
      const list = d.pool.map(id => st.players[id]).sort((a, b) => b.overall - a.overall);
      poolEl.innerHTML = list.map(p => playerCard(p, !isHumanTurn)).join('');
    }

    // 我的阵容（锁定阶段显示上一轮阵容）
    const rosterIds = d.stage === 'lock' && d.previous
      ? [human.core].concat((d.previous.rosterAfter && d.previous.rosterAfter[human.id]) || [])
      : human.roster;
    $('#draft-roster').innerHTML = (d.stage === 'lock'
      ? '<div class="muted" style="font-size:11px;margin-bottom:6px">上一轮阵容（待重建）</div>'
      : '') + rosterIds.map(id => {
      const p = st.players[id];
      return `<div class="mini-player">
        <span class="mini-ovr">${p.overall}</span>
        <div><div class="mini-name">${esc(p.name)}</div><small class="muted">${p.pos} · ${p.h}cm</small></div>
        <span class="mini-pos">${p.core ? '核心' : ''}</span>
      </div>`;
    }).join('');
  }

  function runDraft() {
    const st = Game.state;
    if (!st || st.phase !== 'draft' || !st.draft) return;
    if (st.draft.stage === 'lock') return;
    const slot = Draft.currentSlot(st);
    if (!slot) {
      // 已经没有签位：让状态机执行最后一步 finishDraft
      // （分配阵容、随机补位、把阶段切到 season），否则会卡在选秀页
      if (st.draft) Draft.step(st);
      Game.save(st);
      draftComplete();
      return;
    }
    const team = st.teams.find(t => t.id === slot.teamId);
    if (team.human) return;
    if (UI.draftBusy) return;
    UI.draftBusy = true;
    clearTimeout(UI.draftTimer);
    UI.draftTimer = setTimeout(() => {
      UI.draftBusy = false;
      const rnd = Draft.step(st);
      Game.save(st);
      if (rnd.type === 'done' || st.phase !== 'draft') { draftComplete(); return; }
      renderDraft();
      runDraft();
    }, 380);
  }

  function draftComplete() {
    const st = Game.state;
    if (UI.summaryShown) return;
    UI.summaryShown = true;
    const lastDraft = st.draftHistory[st.draftHistory.length - 1] || { bonus: [] };
    const bonusMap = {};
    (lastDraft.bonus || []).forEach(b => { bonusMap[b.playerId] = true; });

    const rows = st.teams.map(t => `
      <div class="sum-team">
        <div class="sum-head">
          <b>${esc(t.name)}</b>
          <span class="muted">${t.roster.length} 人</span>
        </div>
        <div class="sum-chips">
          ${t.roster.map(id => {
            const p = st.players[id];
            const cls = p.core ? 'is-core' : bonusMap[p.id] ? 'is-bonus' : '';
            const tag = p.core ? '核心' : bonusMap[p.id] ? '随机补位' : '';
            return `<div class="sum-chip ${cls}">
              <span class="ovr">${p.overall}</span>
              <span class="nm">${esc(p.name)}</span>
              ${tag ? `<em>${tag}</em>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>`).join('');

    openModal(`${modalHead('选秀大会结束', '建队核心 + 4 个顺位 + 1 个随机补位，每队 6 人')}
      ${rows}
      <div class="modal-actions is-sticky">
        <button class="btn btn-primary" id="btn-draft-done">进入赛季</button>
      </div>`, { wide: true, onClose: render });
    const btn = $('#btn-draft-done');
    if (btn) btn.addEventListener('click', () => {
      closeModal();
      render();
    });
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
    const human = Game.humanTeam(st);
    const canPlay = Game.canField(st, human.id);
    const opponents = Game.playableOpponents(st);
    const rows = [];

    if (info.playable) {
      if (!canPlay) {
        rows.push(`<div class="action-row"><button class="action-btn" disabled>
          <span class="action-ico">🚑</span>
          <span><span class="action-main">阵容不整</span><span class="action-sub">健康球员不足 3 人，先让伤员恢复</span></span>
        </button></div>`);
      } else if (!opponents.length) {
        rows.push(`<div class="action-row"><button class="action-btn" disabled>
          <span class="action-ico">⏳</span>
          <span><span class="action-main">对手阵容不整</span><span class="action-sub">另外两支球队都凑不齐 3 人，先训练吧</span></span>
        </button></div>`);
      } else {
        opponents.forEach(opp => {
          rows.push(`<div class="action-row"><button class="action-btn" data-match="${opp.id}">
            <span class="action-ico">🏀</span>
            <span><span class="action-main">约战 ${esc(opp.name)}</span>
            <span class="action-sub">${opp.wins} 胜 ${opp.losses} 负 · 3v3 · 先到 21 分</span></span>
            <span class="action-arrow">›</span>
          </button></div>`);
        });
      }
      rows.push(`<div class="action-row"><button class="action-btn" data-train="1">
        <span class="action-ico">🎯</span>
        <span><span class="action-main">全队训练</span><span class="action-sub">选择一个属性，全队 +1（有几率 +2）</span></span>
        <span class="action-arrow">›</span>
      </button></div>`);
      rows.push(`<div class="action-row"><button class="action-btn" data-rest="1">
        <span class="action-ico">😴</span>
        <span><span class="action-main">今天不打了</span><span class="action-sub">全队休息，体力 +6，推进到明天</span></span>
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
    const players = Game.rosterPlayers(st, human.id).sort((a, b) => b.overall - a.overall);
    $('#team-panel').innerHTML = `
      <div class="team-head">
        <div class="team-name">${esc(human.name)}</div>
        <div class="team-record">${human.wins} 胜 ${human.losses} 负</div>
      </div>
      <div class="roster-list">
        ${players.map(p => `
          <div class="roster-row" data-player="${p.id}">
            <span class="roster-ovr">${p.overall}</span>
            <div>
              <div class="roster-name">${esc(p.name)} ${p.injury > 0 ? `<span class="injury-tag">伤 ${p.injury}天</span>` : ''}</div>
              <div style="font-size:10.5px;color:var(--dim)">${p.pos} · ${p.h}cm</div>
            </div>
            <div class="stamina ${staminaClass(p.stamina)}" title="体力 ${Math.round(p.stamina)}"><i style="width:${Math.max(4, p.stamina)}%"></i></div>
          </div>`).join('')}
      </div>`;
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
        <span>2025.07.02 开局</span><span>2026.02.05 中期选秀</span><span>2026.06.09 赛季结束</span>
      </div>`;
  }

  /* ============================================================
   * 交互：比赛 / 训练 / 休息
   * ============================================================ */
  function openMatchPreview(oppId) {
    const st = Game.state;
    const human = Game.humanTeam(st);
    const opp = Game.teamById(st, oppId);
    const preview = Game.previewMatch(st, oppId);
    if (!preview.theirs || !preview.roster.length) return;

    const roster = preview.roster.slice().sort((a, b) => b.overall - a.overall);
    const selected = new Set();

    const cardHtml = p => {
      const hurt = p.injury > 0;
      return `<button class="pick-card ${hurt ? 'is-injured' : ''}" data-pick="${p.id}" ${hurt ? 'disabled' : ''}>
        <span class="pick-check">✓</span>
        <span class="pick-ovr">${p.overall}</span>
        <span class="pick-main">
          <span class="pick-name">${esc(p.name)}</span>
          <span class="pick-sub">${p.pos} · ${p.h}cm${hurt ? ` · 伤停 ${p.injury} 天` : ''}</span>
        </span>
        <span class="stamina ${staminaClass(p.stamina)}"><i style="width:${Math.max(4, p.stamina)}%"></i></span>
      </button>`;
    };

    openModal(`${modalHead('赛前 · 选择首发', `${Cal.labelDate(st.date)} · 3v3 · 先到 21 分`)}
      <div class="pick-head">
        <h4>我的首发 <b id="pick-count">0 / 3</b></h4>
        <span class="muted">每场比赛前都要重新点人，选满 3 人才能开球</span>
      </div>
      <div class="pick-grid" id="pick-grid">${roster.map(cardHtml).join('')}</div>
      <div class="pick-opponent">
        <span class="sb-vs">VS</span>
        <div class="lineup-col">
          <h4>${esc(opp.name)} 预计首发</h4>
          ${preview.theirs.map(p => `<div class="lineup-player"><span class="lp-ovr">${p.overall}</span><span class="lp-name">${esc(p.name)}</span><span class="lp-pos">${p.pos}</span></div>`).join('')}
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close="1">再想想</button>
        <button class="btn btn-primary" id="btn-start-match" disabled>还差 3 人</button>
      </div>`);

    const modal = document.querySelector('#modal-root .modal');
    if (!modal) return;
    const grid = modal.querySelector('#pick-grid');
    const countEl = modal.querySelector('#pick-count');
    const startBtn = modal.querySelector('#btn-start-match');

    grid.addEventListener('click', e => {
      const card = e.target.closest('[data-pick]');
      if (!card || card.disabled) return;
      const id = Number(card.dataset.pick);
      if (selected.has(id)) {
        selected.delete(id);
        card.classList.remove('is-selected');
      } else {
        if (selected.size >= 3) return;
        selected.add(id);
        card.classList.add('is-selected');
      }
      countEl.textContent = `${selected.size} / 3`;
      countEl.classList.toggle('is-full', selected.size === 3);
      startBtn.disabled = selected.size !== 3;
      startBtn.textContent = selected.size === 3 ? '开球' : `还差 ${3 - selected.size} 人`;
    });

    startBtn.addEventListener('click', () => {
      if (selected.size !== 3) return;
      const ids = Array.from(selected);
      const result = Game.playMatch(st, oppId, ids);
      if (!result) { closeModal(); render(); return; }
      showResult(result);
    });
  }

  function showResult(result) {
    const st = Game.state;
    const home = Game.teamById(st, result.homeId);
    const away = Game.teamById(st, result.awayId);
    const humanWin = result.winnerId === 'T1';
    const matchComment = Game.teacherComment(st, humanWin ? 'win' : 'lose', result.date);
    const showComment = matchComment && matchComment.isSchool;

    const table = (team, rows) => `
      <div>
        <div style="display:flex;gap:8px;align-items:baseline;margin-bottom:6px">
          <b style="font-size:13px">${esc(team.name)}</b>
          <span class="muted" style="font-size:11px">${result.homeId === team.id ? '主队' : '客队'}</span>
        </div>
        <table class="box-table">
          <thead><tr><th>球员</th><th>分</th><th>板</th><th>助</th></tr></thead>
          <tbody>
            ${rows.map(r => `<tr class="${result.mvp.id === r.id ? 'is-mvp' : ''}">
              <td>${esc(r.name)}</td><td>${r.pts}</td><td>${r.reb}</td><td>${r.ast}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    openModal(`${modalHead(humanWin ? '比赛结束 · 胜利' : '比赛结束', `${result.date} · ${esc(home.name)} vs ${esc(away.name)}`)}
      <div class="scoreboard">
        <div class="sb-team">
          <div class="sb-name ${humanWin ? 'sb-win' : 'sb-lose'}">${esc(home.name)}</div>
          <div class="sb-sub">${home.wins} 胜 ${home.losses} 负</div>
        </div>
        <div>
          <div class="sb-score"><span class="${humanWin ? 'sb-win' : ''}">${result.scoreH}</span> : <span class="${humanWin ? '' : 'sb-win'}">${result.scoreA}</span></div>
        </div>
        <div class="sb-team">
          <div class="sb-name ${humanWin ? 'sb-lose' : 'sb-win'}">${esc(away.name)}</div>
          <div class="sb-sub">${away.wins} 胜 ${away.losses} 负</div>
        </div>
      </div>
      <div style="text-align:center;margin-top:10px"><span class="sb-tag">本场 MVP · ${esc(result.mvp.name)}（${result.mvp.pts} 分 ${result.mvp.reb} 板）</span></div>
      ${showComment ? teacherNoteHtml(matchComment, true) : ''}
      <div class="box-grid">
        ${table(home, result.boxH)}
        ${table(away, result.boxA)}
      </div>
      <div class="play-log">
        ${result.plays.map(p => `<div><span class="score">${p.score}</span><span>${esc(p.text)}</span></div>`).join('')}
      </div>
      <div class="modal-actions is-sticky">
        <button class="btn btn-primary" id="btn-result-close">继续</button>
      </div>`, { wide: true, onClose: render });

    Game.save(st);
    $('#btn-result-close').addEventListener('click', () => { closeModal(); render(); });
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
    openModal(`${modalHead('规则与设定', '来自 rules.png、schedule.md 与球员信息表.et')}
      <div class="rules-section">
        <h4>一、赛历（schedule.md）</h4>
        <p>赛季从 <code>2025-07-02</code> 到 <code>2026-06-09</code>。</p>
        <ul>
          <li>暑假 7.12—8.10，寒假 2.11—2.24：球场放假。</li>
          <li>暑假留校 7.2—7.11、8.11—8.30；寒假留校 2.5—2.10、2.25—3.1：周二、周四、周六打球，最后一天不打。</li>
          <li>正常上学周：周二、周五下午第一节、周四下午第二节有体育课，周日照常打球。</li>
          <li>小考试 3 天、大考试 6 天：考试周每天都可以打球。</li>
        </ul>
        <img class="rules-img" src="rules.png" alt="选秀规则原图" />
        <h4>二、选秀（rules.png）</h4>
        <ul>
          <li>钦定三个建队核心：大娘、奶龙、走刀。</li>
          <li>三支球队分为 A / B / C 三个批次，优先级依次递减；批次由最近一次比赛结果决定，输得最多的拿 A。</li>
          <li>选秀顺序：<code>ABC ABC BCA CAB</code>，共 12 个签位，每队 4 人。</li>
          <li>锁定：选秀前可锁定上一轮自己的一名球员，至多一人，不能是上一轮自己的第一顺位；锁定后该球员充当本轮第一顺位。</li>
          <li>交易市场：v1.1.3 暂未实现，排在后续版本计划里。</li>
        </ul>
        <h4>三、比赛</h4>
        <ul>
          <li>3v3，先到 21 分且领先 2 分获胜。</li>
          <li>球员属性由身高、体重、位置和名字稳定生成，特性来自「球场特性」列。</li>
          <li>体力低于 28 时带伤上阵有受伤风险，受伤球员无法出场。</li>
        </ul>
        <h4>四、数据说明</h4>
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

    // 选秀
    $('#draft-pool').addEventListener('click', e => {
      const btn = e.target.closest('.player-card');
      if (!btn || btn.disabled) return;
      const st = Game.state;
      const slot = Draft.currentSlot(st);
      if (!slot) return;
      const team = st.teams.find(t => t.id === slot.teamId);
      if (!team.human) return;
      Draft.humanPick(st, Number(btn.dataset.id));
      Game.save(st);
      renderDraft();
      runDraft();
    });
    $('#draft-lockpanel').addEventListener('click', e => {
      const btn = e.target.closest('[data-lock]');
      if (!btn) return;
      const val = btn.dataset.lock;
      Draft.humanLock(Game.state, val === '0' ? null : Number(val));
      Game.save(Game.state);
      renderDraft();
      runDraft();
    });

    // 主界面
    document.addEventListener('click', e => {
      const match = e.target.closest('[data-match]');
      if (match) { openMatchPreview(match.dataset.match); return; }
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

    // 演示模式：?demo=draft / ?demo=main / ?demo=match / ?demo=end
    try {
      const params = new URLSearchParams(global.location.search);
      const demo = params.get('demo');
      if (demo) {
        Game.create();
        const st = Game.state;
        if (demo === 'draft') {
          // 自动处理 AI 的签位，停在玩家选秀的那一刻
          let guard = 0;
          while (st.phase === 'draft' && st.draft && st.draft.stage === 'pick' && guard++ < 20) {
            const slot = Draft.currentSlot(st);
            if (!slot) break;
            if (st.teams.find(t => t.id === slot.teamId).human) break;
            Draft.step(st);
          }
          Game.save(st);
          render();
          return;
        }
        const autoDraft = () => {
          let guard = 0;
          while (st.phase === 'draft' && guard++ < 80) {
            if (st.draft.stage === 'lock') { Draft.humanLock(st, null); continue; }
            const r = Draft.step(st);
            if (r.type === 'human') {
              const best = st.draft.pool.map(id => st.players[id]).sort((a, b) => b.overall - a.overall)[0];
              Draft.humanPick(st, best.id);
            }
          }
        };
        autoDraft();

        if (demo === 'summary') {
          Game.save(st);
          render();
          draftComplete();
          return;
        }

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

        if (demo === 'school') {
          skipToSchool(true);
          Game.save(st);
          render();
          return;
        }

        if (demo === 'lineup') {
          skipToSchool(true);
          Game.save(st);
          render();
          const opps = Game.playableOpponents(st);
          if (opps.length) openMatchPreview(opps[0].id);
          return;
        }

        if (demo === 'schoolmatch') {
          skipToSchool(true);
          const opps = Game.playableOpponents(st);
          const ids = Game.rosterPlayers(st, 'T1')
            .filter(p => p.injury <= 0)
            .sort((a, b) => b.overall - a.overall)
            .slice(0, 3)
            .map(p => p.id);
          const result = opps.length ? Game.playMatch(st, opps[0].id, ids) : null;
          Game.save(st);
          render();
          if (result) showResult(result);
          return;
        }

        const playSeason = untilDraft => {
          let guard = 0;
          while (st.phase === 'season' && guard++ < 400) {
            const info = Cal.dayInfo(st.date);
            const opps = Game.playableOpponents(st);
            if (info.playable && opps.length) Game.playMatch(st, opps[0].id);
            else Game.rest(st);
            if (st.phase === 'draft') {
              if (untilDraft) break;
              autoDraft();
            }
          }
        };

        if (demo === 'end') {
          playSeason(false);
          Game.save(st);
          render();
          return;
        }

        if (demo === 'lock') {
          playSeason(true);
          Game.save(st);
          render();
          return;
        }

        Game.skip(st);
        if (demo === 'match') {
          const opps = Game.playableOpponents(st);
          const result = opps.length ? Game.playMatch(st, opps[0].id) : null;
          Game.save(st);
          render();
          if (result) showResult(result);
          return;
        }
        if (demo === 'main') {
          const opps = Game.playableOpponents(st);
          if (opps.length) Game.playMatch(st, opps[0].id);
          Game.skip(st);
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
