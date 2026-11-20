/* I Love You 3000 mini league site. Everything is calculated in the browser from live FPL data
   fetched through /api/* (a Cloudflare Pages Function that proxies the public FPL API). */
(() => {
'use strict';
const L = window.LEAGUE;
const view = document.getElementById('view');
const tipEl = document.getElementById('tip');

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => (n == null || Number.isNaN(n) ? '–' : Number(n).toLocaleString('en-IN'));
const money = (n) => L.currency + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const sum = (a, f = (x) => x) => a.reduce((s, x) => s + (f(x) || 0), 0);
const avg = (a) => (a.length ? sum(a) / a.length : 0);
const CHIP_NAMES = { wildcard: 'Wildcard', freehit: 'Free Hit', '3xc': 'Triple Captain', bboost: 'Bench Boost', manager: 'Assistant Manager' };
const chipName = (c) => CHIP_NAMES[c] || c;
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

// ---------- API with a small concurrency limit and in-memory cache ----------
const memo = new Map();
const queue = [];
let active = 0;
function pump() {
  while (active < 6 && queue.length) {
    const [fn, res, rej] = queue.shift();
    active++;
    fn().then(res, rej).finally(() => { active--; pump(); });
  }
}
const limited = (fn) => new Promise((res, rej) => { queue.push([fn, res, rej]); pump(); });
function api(path, fresh = false) {
  if (!fresh && memo.has(path)) return memo.get(path);
  const p = limited(async () => {
    let r;
    try { r = await fetch('/api/' + path, fresh ? { cache: 'reload' } : undefined); }
    catch { throw new Error('Could not connect. Check your internet connection.'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'FPL data request failed (' + r.status + ')');
    return j;
  });
  memo.set(path, p);
  p.catch(() => memo.delete(path));
  return p;
}

// ---------- core data ----------
let C = null; // computed league state
let loadingCore = null;

async function loadStandings(fresh) {
  const out = [];
  let league = null;
  for (let page = 1; page < 20; page++) {
    const d = await api(`leagues-classic/${L.leagueId}/standings?page_standings=${page}`, fresh);
    league = d.league;
    out.push(...d.standings.results);
    if (!d.standings.has_next) break;
  }
  return { league, rows: out };
}

async function loadCore(fresh = false) {
  const [boot, st] = await Promise.all([api('bootstrap-static', fresh), loadStandings(fresh)]);
  const hist = await Promise.all(st.rows.map((r) => api(`entry/${r.entry}/history`, fresh)));
  C = build(boot, st, hist);
  C.loadedAt = new Date();
  return C;
}

function build(boot, st, hist) {
  const events = boot.events;
  const cur = events.find((e) => e.is_current) || null;
  const next = events.find((e) => e.is_next) || null;
  const curGW = cur ? cur.id : 0;
  const finished = new Set(events.filter((e) => e.finished && e.data_checked).map((e) => e.id));
  const teams = new Map(boot.teams.map((t) => [t.id, t]));
  const players = new Map(boot.elements.map((p) => [p.id, p]));
  const posName = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD', 5: 'MGR' };

  const managers = st.rows.map((r, i) => {
    const h = hist[i] || { current: [], chips: [], past: [] };
    const gw = {};
    for (const c of h.current) {
      gw[c.event] = {
        points: c.points, hit: c.event_transfers_cost, net: c.points - c.event_transfers_cost, total: c.total_points,
        tx: c.event_transfers, bench: c.points_on_bench, value: c.value / 10, bank: c.bank / 10, orank: c.overall_rank, chip: null,
      };
    }
    for (const ch of h.chips) if (gw[ch.event]) gw[ch.event].chip = ch.name;
    return {
      id: r.entry, team: r.entry_name, name: r.player_name, rank: r.rank, lastRank: r.last_rank,
      gwPts: r.event_total, total: r.total, gw, chips: h.chips.slice(), past: h.past || [],
    };
  });

  const gws = [...new Set(managers.flatMap((m) => Object.keys(m.gw).map(Number)))].sort((a, b) => a - b);

  // League rank after each gameweek (ties share a rank).
  for (const g of gws) {
    const arr = managers.filter((m) => m.gw[g]).sort((a, b) => b.gw[g].total - a.gw[g].total);
    arr.forEach((m, i) => { m.gw[g].lrank = i && arr[i - 1].gw[g].total === m.gw[g].total ? arr[i - 1].gw[g].lrank : i + 1; });
  }
  // Average league score per GW.
  const gwAvg = {}, gwMax = {};
  for (const g of gws) {
    const pts = managers.filter((m) => m.gw[g]).map((m) => m.gw[g].points);
    gwAvg[g] = avg(pts);
    gwMax[g] = Math.max(...pts);
  }

  const state = { boot, events, cur, next, curGW, finished, teams, players, posName, managers, gws, gwAvg, gwMax, league: st.league };
  state.byId = new Map(managers.map((m) => [m.id, m]));
  state.motw = gws.map((g) => motwFor(state, g)).filter(Boolean);
  state.chipPlays = managers.flatMap((m) => m.chips.map((c) => ({ m, chip: c.name, gw: c.event, score: null })));
  for (const p of state.chipPlays) {
    if ((p.chip === 'wildcard' || p.chip === 'freehit') && p.m.gw[p.gw]) p.score = p.m.gw[p.gw].points;
  }
  state.chipDetailsLoaded = false;
  return state;
}

const regularTx = (d) => (!d ? 0 : d.chip === 'wildcard' || d.chip === 'freehit' ? 0 : d.tx);
function seasonTx(m, g) { let t = 0; for (let e = 1; e <= g; e++) t += regularTx(m.gw[e]); return t; }

function motwFor(S, g) {
  const rows = S.managers.filter((m) => m.gw[g]).map((m) => ({
    m, pts: L.motw.points === 'net' ? m.gw[g].net : m.gw[g].points,
    tx: L.motw.tiebreak === 'season' ? seasonTx(m, g) : regularTx(m.gw[g]),
  }));
  if (!rows.length) return null;
  const top = Math.max(...rows.map((r) => r.pts));
  let c = rows.filter((r) => r.pts === top);
  let note = '';
  if (c.length > 1) {
    const mn = Math.min(...c.map((r) => r.tx));
    const c2 = c.filter((r) => r.tx === mn);
    const txWord = L.motw.tiebreak === 'season' ? 'season transfers' : 'transfers that week';
    note = c2.length < c.length
      ? `${c.length} tied on ${top}. Won on fewest ${txWord} (${mn}).`
      : `${c.length} tied on ${top} with ${mn} ${txWord} each. Prize split.`;
    c = c2;
  }
  return { gw: g, pts: top, winners: c, share: L.motw.amount / c.length, note, final: S.finished.has(g) };
}

// Triple Captain and Bench Boost scores need that week's team and live player points.
async function loadChipDetails(S) {
  if (S.chipDetailsLoaded) return;
  const plays = S.chipPlays.filter((p) => p.chip === '3xc' || p.chip === 'bboost');
  const gwsNeeded = [...new Set(plays.map((p) => p.gw))];
  const lives = new Map(await Promise.all(gwsNeeded.map(async (g) => [g, liveMap(await api(`event/${g}/live`))])));
  await Promise.all(plays.map(async (p) => {
    try {
      const pk = await api(`entry/${p.m.id}/event/${p.gw}/picks`);
      const live = lives.get(p.gw);
      if (p.chip === 'bboost') {
        p.score = sum(pk.picks.filter((x) => x.position > 11), (x) => live.get(x.element)?.total_points || 0);
        p.detail = pk.picks.filter((x) => x.position > 11).map((x) => `${S.players.get(x.element)?.web_name || '?'} ${live.get(x.element)?.total_points || 0}`).join(', ');
      } else {
        const cap = pk.picks.find((x) => x.is_captain);
        const vice = pk.picks.find((x) => x.is_vice_captain);
        let who = cap;
        if (S.finished.has(p.gw) && (live.get(cap.element)?.minutes || 0) === 0 && vice) who = vice;
        const pts = live.get(who.element)?.total_points || 0;
        p.score = pts * 3;
        p.detail = `${S.players.get(who.element)?.web_name || '?'} ${pts} × 3${who === vice ? ' (vice)' : ''}`;
      }
    } catch { p.score = null; }
  }));
  S.chipDetailsLoaded = true;
}
const liveMap = (d) => new Map(d.elements.map((e) => [e.id, e.stats]));

function chipStandings(S) {
  const out = {};
  for (const key of Object.keys(L.chips)) {
    const plays = S.chipPlays.filter((p) => p.chip === key && p.score != null).sort((a, b) => b.score - a.score);
    const top = plays.length ? plays[0].score : null;
    const leaders = plays.filter((p) => p.score === top);
    out[key] = { plays, leaders, share: leaders.length ? L.chips[key].amount / leaders.length : 0 };
  }
  return out;
}

// Top-N prize by current league rank. Managers tied on a rank share the prizes for the places they cover.
function topPrizes(S) {
  const res = new Map();
  const sorted = S.managers.slice().sort((a, b) => a.rank - b.rank);
  let i = 0;
  while (i < sorted.length && sorted[i].rank <= L.top.length) {
    const r = sorted[i].rank;
    const group = sorted.filter((m) => m.rank === r);
    const places = L.top.slice(r - 1, r - 1 + group.length);
    const each = sum(places) / group.length;
    for (const m of group) res.set(m.id, { place: r, amount: each, tied: group.length > 1 });
    i += group.length;
  }
  return res;
}

function moneyTable(S) {
  const t = new Map(S.managers.map((m) => [m.id, { m, motw: 0, motwWins: 0, chips: 0, top: 0 }]));
  for (const w of S.motw) if (w.final) for (const r of w.winners) { const x = t.get(r.m.id); x.motw += w.share; x.motwWins++; }
  if (S.chipDetailsLoaded) {
    const cs = chipStandings(S);
    for (const k in cs) for (const p of cs[k].leaders) t.get(p.m.id).chips += cs[k].share;
  }
  for (const [id, v] of topPrizes(S)) t.get(id).top = v.amount;
  return [...t.values()].map((x) => ({ ...x, total: x.motw + x.chips + x.top }));
}

// ---------- shared UI ----------
const myTeam = () => Number(store.get('myTeam')) || 0;
function teamCell(m) {
  return `<td class="l"><span class="tm">${esc(m.team)}</span><span class="mg">${esc(m.name)}</span></td>`;
}
function moveBadge(m) {
  const d = (m.lastRank || m.rank) - m.rank;
  if (!m.lastRank || d === 0) return '<span class="mv same" aria-label="no change">–</span>';
  return d > 0 ? `<span class="mv up" aria-label="up ${d}">▲</span>` : `<span class="mv down" aria-label="down ${-d}">▼</span>`;
}
function heatStyle(S, g, pts) {
  const all = S.managers.filter((m) => m.gw[g]).map((m) => m.gw[g].points);
  const mean = avg(all);
  const sd = Math.sqrt(avg(all.map((x) => (x - mean) ** 2))) || 1;
  const z = Math.max(-2, Math.min(2, (pts - mean) / sd));
  const a = (Math.abs(z) * 0.32).toFixed(2);
  return `background:rgba(var(${z >= 0 ? '--good-bg' : '--bad-bg'}),${a})`;
}
function formCells(S, m, n = 5) {
  const gws = S.gws.slice(-n);
  return `<span class="form">${gws.map((g) => {
    const d = m.gw[g];
    if (!d) return '<span class="fc">–</span>';
    return `<span class="fc" style="${heatStyle(S, g, d.points)}" title="GW${g}: ${d.points} pts">${d.points}</span>`;
  }).join('')}</span>`;
}
function myTeamSelect(S) {
  const me = myTeam();
  return `<label class="small muted" for="my-team">Highlight my team</label>
    <select id="my-team"><option value="">None</option>${S.managers.slice().sort((a, b) => a.team.localeCompare(b.team))
      .map((m) => `<option value="${m.id}" ${m.id === me ? 'selected' : ''}>${esc(m.team)} (${esc(m.name)})</option>`).join('')}</select>`;
}
function bindMyTeam() {
  const s = document.getElementById('my-team');
  if (s) s.onchange = () => { store.set('myTeam', s.value); render(); };
}
function bindRowLinks(root = view) {
  root.querySelectorAll('tr[data-m]').forEach((tr) => {
    tr.classList.add('click');
    tr.tabIndex = 0;
    const go = () => { location.hash = '#/manager/' + tr.dataset.m; };
    tr.addEventListener('click', go);
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  });
}
function sortable(table, rows, renderRows, initial) {
  let key = initial.key, dir = initial.dir;
  const ths = table.querySelectorAll('th[data-sort]');
  const paint = () => {
    ths.forEach((th) => th.classList.toggle('on', th.dataset.sort === key));
    ths.forEach((th) => th.classList.toggle('asc', th.dataset.sort === key && dir === 1));
    const getter = (r) => r.sortVals[key];
    const sorted = rows.slice().sort((a, b) => ((getter(a) ?? -Infinity) > (getter(b) ?? -Infinity) ? 1 : (getter(a) ?? -Infinity) < (getter(b) ?? -Infinity) ? -1 : 0) * dir || a.tiebreak - b.tiebreak);
    table.querySelector('tbody').innerHTML = renderRows(sorted);
    bindRowLinks(table);
  };
  ths.forEach((th) => {
    th.classList.add('sort');
    th.tabIndex = 0;
    const go = () => { if (key === th.dataset.sort) dir = -dir; else { key = th.dataset.sort; dir = th.dataset.asc ? 1 : -1; } paint(); };
    th.addEventListener('click', go);
    th.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
  paint();
}

// Tooltips (pointer + keyboard-less fallback via title)
function showTip(html, x, y) {
  tipEl.innerHTML = html; tipEl.hidden = false;
  const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
  tipEl.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, x + 14)) + 'px';
  tipEl.style.top = Math.max(8, Math.min(window.innerHeight - h - 8, y - h - 10)) + 'px';
}
const hideTip = () => { tipEl.hidden = true; };

// Simple multi-line chart. series: [{name, color, width, points:[{x,y,tip}] , muted}]
function lineChart(el, series, opt = {}) {
  const W = Math.max(300, el.clientWidth || 600), H = opt.height || 300;
  const all = series.flatMap((s) => s.points);
  if (!all.length) { el.innerHTML = '<p class="muted">No data yet.</p>'; return; }
  const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = opt.y0 ?? Math.min(...ys), y1 = Math.max(...ys);
  if (y0 === y1) y1 = y0 + 1;
  const step = niceStep((y1 - y0) / 5);
  y0 = Math.floor(y0 / step) * step; y1 = Math.ceil(y1 / step) * step;
  if (opt.y0 != null && y0 < opt.y0) y0 = opt.y0;
  const ticks = []; for (let v = y0; v <= y1 + 1e-9; v += step) ticks.push(v);
  const fmtY = opt.fmtY || ((v) => num(v));
  const labW = Math.max(...ticks.map((t) => String(fmtY(t)).length)) * 7 + 10;
  const endW = opt.endLabels ? Math.min(W * 0.35, Math.max(0, ...series.filter((s) => s.label).map((s) => s.label.length * 7)) + 14) : 10;
  const m = { l: labW, r: endW, t: 10, b: 26 };
  const X = (v) => m.l + (x1 === x0 ? 0 : ((v - x0) / (x1 - x0)) * (W - m.l - m.r));
  const Y = (v) => { const t = (v - y0) / (y1 - y0); return opt.invert ? m.t + t * (H - m.t - m.b) : H - m.b - t * (H - m.t - m.b); };
  const xt = []; const span = x1 - x0; const xs2 = span > 16 ? 4 : span > 8 ? 2 : 1;
  for (let v = x0; v <= x1; v += xs2) xt.push(v);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opt.label || 'Chart')}">`;
  s += ticks.map((t) => `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${m.l - 6}" y="${Y(t)}" dy="0.32em" text-anchor="end">${esc(fmtY(t))}</text>`).join('');
  s += xt.map((v) => `<text x="${X(v)}" y="${H - 6}" text-anchor="middle">${opt.xPrefix ?? 'GW'}${v}</text>`).join('');
  const ordered = series.slice().sort((a, b) => (a.muted ? 0 : 1) - (b.muted ? 0 : 1));
  for (const se of ordered) {
    const pts = se.points.slice().sort((a, b) => a.x - b.x);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
    s += `<path d="${d}" fill="none" stroke="${se.color}" stroke-width="${se.width || 2}" stroke-linejoin="round" stroke-linecap="round" opacity="${se.muted ? 0.35 : 1}"/>`;
    if (!se.muted) s += pts.map((p) => `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="3.2" fill="${se.color}"/>`).join('');
    if (opt.endLabels && se.label && pts.length) { const p = pts[pts.length - 1]; s += `<text x="${X(p.x) + 8}" y="${Y(p.y)}" dy="0.32em" style="fill:${se.color};font-weight:700">${esc(se.label)}</text>`; }
  }
  s += '</svg>';
  el.innerHTML = s;
  const svg = el.querySelector('svg');
  const flat = series.flatMap((se) => se.points.map((p) => ({ ...p, se })));
  svg.addEventListener('pointermove', (ev) => {
    const r = svg.getBoundingClientRect(), k = W / r.width;
    const px = (ev.clientX - r.left) * k, py = (ev.clientY - r.top) * k;
    let best = null, bd = Infinity;
    for (const p of flat) { const d = Math.hypot(X(p.x) - px, Y(p.y) - py); if (d < bd) { bd = d; best = p; } }
    if (best && bd < 36) showTip(best.tip || `<b>${esc(best.se.name)}</b>GW${best.x}: ${num(best.y)}`, ev.clientX, ev.clientY); else hideTip();
  });
  svg.addEventListener('pointerleave', hideTip);
}
function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
const PALETTE = ['#e90052', '#04c8d0', '#7c3aed', '#00b86b', '#f59e0b', '#2563eb'];

// Club shirt colours (approximate primary kits); unknown clubs get a colour from their id.
const CLUB = { ARS: '#ef0107', AVL: '#670e36', BOU: '#da291c', BRE: '#e30613', BHA: '#0057b8', BUR: '#6c1d45', CHE: '#034694', COV: '#59cbe8', CRY: '#1b458f', EVE: '#003399', FUL: '#ffffff', HUL: '#f5a12d', IPS: '#0044a9', LEE: '#ffffff', LEI: '#003090', LIV: '#c8102e', MCI: '#6cabdd', MUN: '#da291c', NEW: '#241f20', NFO: '#dd0000', SHU: '#ee2737', SOU: '#d71920', SUN: '#eb172b', TOT: '#ffffff', WHU: '#7a263a', WOL: '#fdb913', NOR: '#00a650', WAT: '#fbee23', WBA: '#122f67', LUT: '#f78f1e', MID: '#e11b22', SWA: '#ffffff', STK: '#e03a3e', BIR: '#0000ff', DER: '#ffffff', QPR: '#1d5ba4', PRE: '#ffffff', BRI: '#e2001a', CAR: '#0070b5', MIL: '#001d5e', OXF: '#ffd200', POR: '#001489', SHW: '#ffffff', PLY: '#00513f', BLB: '#ffffff', WAT2: '#fbee23' };
function clubColor(t) {
  const c = CLUB[t.short_name] || `hsl(${(t.id * 47) % 360} 60% 42%)`;
  let fg = '#fff';
  if (c.startsWith('#')) { const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16); if (0.299 * r + 0.587 * g + 0.114 * b > 160) fg = '#22042a'; }
  return { bg: c, fg };
}

// ---------- pages ----------
function setTab(name) {
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === name));
}

function pageHome(S) {
  setTab('');
  const g = S.curGW;
  const live = S.cur && !S.finished.has(g);
  const lead = S.managers.find((m) => m.rank === 1);
  const second = S.managers.filter((m) => m.rank > 1).sort((a, b) => a.rank - b.rank)[0];
  const curM = S.motw.find((w) => w.gw === g);
  const pool = S.managers.length * L.entryFee;
  const deadline = S.next ? new Date(S.next.deadline_time) : null;
  const won = new Map(moneyTable(S).map((x) => [x.m.id, x]));
  const me = myTeam();
  const rows = S.managers.map((m) => ({ m, tiebreak: m.rank, sortVals: { rank: m.rank, gw: m.gwPts, total: m.total, form: sum(S.gws.slice(-5), (x) => m.gw[x]?.points), won: won.get(m.id).motw } }));
  view.innerHTML = `
  <section class="hero">
    <div>
      <h1>${esc(L.name)}</h1>
      <p>${S.managers.length} managers · ${esc(S.league?.name || '')} · Gameweek ${g}${live ? ' is live' : ' finished'}</p>
    </div>
    <div class="hero-stats">
      <div class="hs"><small>Leader</small><b>${esc(lead?.team)}</b><span>${esc(lead?.name)} · ${num(lead?.total)} pts${second ? ` · +${lead.total - second.total} clear` : ''}</span></div>
      <div class="hs"><small>GW${g} ${live ? 'top score so far' : 'Manager of the Week'}</small><b>${curM ? curM.pts : '–'}</b><span>${curM ? curM.winners.map((w) => esc(w.m.name)).join(', ') : ''}</span></div>
      <div class="hs"><small>League average GW${g}</small><b>${Math.round(S.gwAvg[g] || 0)}</b><span>FPL average ${S.cur?.average_entry_score ?? '–'}</span></div>
      <div class="hs"><small>${deadline ? 'GW' + S.next.id + ' deadline' : 'Season'}</small><b class="num" id="countdown">${deadline ? '' : 'Complete'}</b><span>${deadline ? deadline.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span></div>
      <div class="hs"><small>Prize pool</small><b>${money(pool)}</b><span>${S.managers.length} × ${money(L.entryFee)}</span></div>
    </div>
  </section>
  <section class="card">
    <div class="card-h"><h2>Standings</h2><p>Tap a manager to see their team, history and transfers. Tap a heading to sort. Last 5 shows each of the last five gameweeks, green above the league average and red below.</p></div>
    <div class="table-tools">${myTeamSelect(S)}</div>
    <div class="tw"><table id="st">
      <thead><tr><th class="l" data-sort="rank" data-asc="1">Pos</th><th class="l">Team</th><th data-sort="gw">GW${g}</th><th data-sort="total">Total</th><th class="hide-sm" data-sort="form">Last 5</th><th data-sort="won">MOTW ₹</th></tr></thead>
      <tbody></tbody></table></div>
  </section>`;
  sortable(view.querySelector('#st'), rows, (rs) => rs.map(({ m }) => `
    <tr data-m="${m.id}" class="${m.id === me ? 'me' : ''}">
      <td class="l"><span class="pos">${m.rank}${moveBadge(m)}</span></td>${teamCell(m)}
      <td class="big">${m.gwPts}</td><td class="big">${num(m.total)}</td>
      <td class="hide-sm">${formCells(S, m)}</td>
      <td>${won.get(m.id).motw ? money(won.get(m.id).motw) : '<span class="muted">–</span>'}</td>
    </tr>`).join(''), { key: 'rank', dir: 1 });
  bindMyTeam();
  if (deadline) startCountdown(deadline);
}

let cdTimer = null;
function startCountdown(d) {
  clearInterval(cdTimer);
  const tick = () => {
    const el = document.getElementById('countdown');
    if (!el) { clearInterval(cdTimer); return; }
    let s = Math.max(0, Math.floor((d - Date.now()) / 1000));
    const dd = Math.floor(s / 86400); s %= 86400; const hh = Math.floor(s / 3600); s %= 3600; const mm = Math.floor(s / 60); s %= 60;
    el.textContent = dd ? `${dd}d ${hh}h ${mm}m` : `${hh}h ${mm}m ${s}s`;
  };
  tick();
  cdTimer = setInterval(tick, 1000);
}

async function pagePrizes(S) {
  setTab('prizes');
  const total = S.managers.length * L.entryFee;
  const motwPool = L.motw.amount * S.events.length;
  const topPool = sum(L.top);
  const chipPool = sum(Object.values(L.chips), (c) => c.amount);
  const tp = topPrizes(S);
  const top = S.managers.filter((m) => tp.has(m.id)).sort((a, b) => a.rank - b.rank);
  const motwRows = S.events.map((e) => S.motw.find((w) => w.gw === e.id) || { gw: e.id, upcoming: true });
  view.innerHTML = `
  <section class="hero">
    <div><h1>Prizes</h1><p>${S.managers.length} managers × ${money(L.entryFee)} entry = ${money(total)} prize pool. Manager of the Week is paid for each finished gameweek. Top 5 and chip prizes are paid at the end of the season, so they show who would win if the season ended now.</p></div>
    <div class="hero-stats">
      <div class="hs"><small>Manager of the Week</small><b>${money(motwPool)}</b><span>${S.events.length} × ${money(L.motw.amount)}</span></div>
      <div class="hs"><small>Top 5</small><b>${money(topPool)}</b><span>${L.top.map((x) => money(x)).join(' · ')}</span></div>
      <div class="hs"><small>Chip prizes</small><b>${money(chipPool)}</b><span>4 × ${money(250)}</span></div>
      <div class="hs"><small>Paid out so far</small><b>${money(sum(S.motw.filter((w) => w.final), () => L.motw.amount))}</b><span>${S.motw.filter((w) => w.final).length} weekly prizes</span></div>
    </div>
  </section>

  <section class="card">
    <div class="card-h"><h2>Top 5 if the season ended now</h2><p>Based on the live league table. Managers tied on the same rank share the prizes for the places they cover.</p></div>
    <div class="card-b grid4">${top.map((m) => `
      <div class="prize ${m.rank === 1 ? 'feature' : ''}">
        <div style="display:flex;align-items:center;gap:8px"><span class="medal m${m.rank}">${m.rank}</span><span class="lab">${ordinal(m.rank)} place${tp.get(m.id).tied ? ' (tied)' : ''}</span></div>
        <div class="amt">${money(tp.get(m.id).amount)}</div>
        <div class="who">${esc(m.team)}</div><div class="muted small">${esc(m.name)} · ${num(m.total)} pts</div>
      </div>`).join('')}</div>
  </section>

  <section class="card" id="chips-card">
    <div class="card-h"><h2>Chip prizes</h2><p>Best single use of each chip this season. Wildcard and Free Hit go by that week's score. Triple Captain goes by the captain's points (×3). Bench Boost goes by points scored on the bench.</p></div>
    <div class="card-b" id="chip-body"><div class="loading"><span class="spinner"></span>Working out Triple Captain and Bench Boost scores…</div></div>
  </section>

  <section class="card">
    <div class="card-h"><h2>Manager of the Week</h2><p>${esc(motwRuleText())}</p></div>
    <div class="tw"><table>
      <thead><tr><th class="l">GW</th><th class="l">Winner</th><th>Points</th><th class="l hide-sm">Note</th><th>Prize</th><th class="l">Status</th></tr></thead>
      <tbody>${motwRows.map((w) => w.upcoming ? `
        <tr><td class="l">GW${w.gw}</td><td class="l muted">Upcoming</td><td></td><td class="hide-sm"></td><td class="muted">${money(L.motw.amount)}</td><td></td></tr>` : `
        <tr${w.winners.length === 1 ? ` data-m="${w.winners[0].m.id}"` : ''} class="${w.winners.some((x) => x.m.id === myTeam()) ? 'me' : ''}">
          <td class="l">GW${w.gw}</td>
          <td class="l">${w.winners.map((x) => `<span class="tm">${esc(x.m.team)}</span><span class="mg">${esc(x.m.name)}${w.winners.length > 1 || w.note ? ` · ${x.tx} transfers` : ''}</span>`).join('')}</td>
          <td class="big">${w.pts}</td>
          <td class="l small muted hide-sm" style="white-space:normal;min-width:180px">${esc(w.note)}</td>
          <td>${w.winners.length > 1 ? `${money(w.share)} each` : money(w.share)}</td>
          <td class="l">${w.final ? '<span class="pill final">Final</span>' : '<span class="pill prov">Live</span>'}</td>
        </tr>`).join('')}</tbody></table></div>
  </section>

  <section class="card">
    <div class="card-h"><h2>Money table</h2><p>Weekly prizes already won, plus the Top 5 and chip prizes each manager would get if the season ended now.</p></div>
    <div class="tw"><table id="money"><thead><tr><th class="l">Team</th><th data-sort="motw">MOTW won</th><th data-sort="top">Top 5</th><th data-sort="chips">Chips</th><th data-sort="total">Total</th></tr></thead><tbody></tbody></table></div>
  </section>

  <section class="card">
    <div class="card-h"><h2>Rules</h2></div>
    <div class="card-b"><ul class="rules">
      <li><b>Entry:</b> ${money(L.entryFee)} per manager.</li>
      <li><b>Manager of the Week:</b> ${money(L.motw.amount)} each gameweek to the highest gameweek score.</li>
      <li><b>Ties:</b> the manager with the fewest regular transfers wins. If still tied, the prize is split equally. Wildcard and Free Hit transfers don't count.</li>
      <li><b>Top 5:</b> ${L.top.map((x, i) => `${ordinal(i + 1)} ${money(x)}`).join(', ')}.</li>
      ${Object.values(L.chips).map((c) => `<li><b>Best ${esc(c.label)} (${money(c.amount)}):</b> ${esc(c.rule)}.</li>`).join('')}
    </ul></div>
  </section>`;
  bindRowLinks();
  const paintMoney = () => {
    const mt = moneyTable(S).filter((x) => x.total > 0);
    sortable(view.querySelector('#money'), mt.map((x) => ({ ...x, tiebreak: x.m.rank, sortVals: { motw: x.motw, top: x.top, chips: x.chips, total: x.total } })), (rs) => rs.map((x) => `
      <tr data-m="${x.m.id}" class="${x.m.id === myTeam() ? 'me' : ''}">${teamCell(x.m)}
        <td>${x.motw ? money(x.motw) + ` <span class="muted small">(${x.motwWins})</span>` : '–'}</td><td>${x.top ? money(x.top) : '–'}</td><td>${x.chips ? money(x.chips) : '–'}</td><td class="big">${money(x.total)}</td></tr>`).join('') || '<tr><td class="l muted" colspan="5">No prizes yet.</td></tr>', { key: 'total', dir: -1 });
  };
  paintMoney();
  try {
    await loadChipDetails(S);
  } catch (e) {
    const b = document.getElementById('chip-body');
    if (b) b.innerHTML = `<p class="muted">Couldn't load chip scores: ${esc(e.message)}</p>`;
    return;
  }
  const b = document.getElementById('chip-body');
  if (!b) return;
  const cs = chipStandings(S);
  b.innerHTML = `<div class="grid4">${Object.entries(L.chips).map(([k, c]) => {
    const x = cs[k];
    return `<div class="prize">
      <div class="lab">Best ${esc(c.label)} · ${money(c.amount)}</div>
      ${x.plays.length ? `<div class="amt">${x.plays[0].score}<span class="muted small" style="font-family:var(--f-body)"> pts</span></div>
      <div class="who">${x.leaders.map((p) => esc(p.m.team)).join(' & ')}</div>
      <div class="muted small">${x.leaders.map((p) => `${esc(p.m.name)}, GW${p.gw}${p.detail ? ' · ' + esc(p.detail) : ''}`).join('<br>')}${x.leaders.length > 1 ? '<br>Tied, prize split' : ''}</div>
      ${x.plays.length > 1 ? `<ol start="2" class="small">${x.plays.slice(x.leaders.length, x.leaders.length + 3).map((p) => `<li>${esc(p.m.name)} · ${p.score} (GW${p.gw})</li>`).join('')}</ol>` : ''}
      <div class="muted small">${x.plays.length} played so far${x.plays.some((p) => !S.finished.has(p.gw)) ? ' · includes a live gameweek' : ''}</div>`
      : '<div class="muted">Nobody has played it yet.</div>'}
    </div>`;
  }).join('')}</div>`;
  paintMoney();
}
function motwRuleText() {
  return `Highest gameweek score${L.motw.points === 'net' ? ' after transfer hits' : ' (as shown in the FPL league table, before hits)'} wins ${money(L.motw.amount)}. Ties go to the fewest regular transfers ${L.motw.tiebreak === 'season' ? 'made this season' : 'made that gameweek'}; Wildcard and Free Hit transfers don't count. If still tied, the prize is split.`;
}

function pageForm(S) {
  setTab('form');
  const gws = S.gws.slice(-5);
  const me = myTeam();
  const rows = S.managers.map((m) => {
    const d = gws.map((g) => m.gw[g]).filter(Boolean);
    const pts = sum(d, (x) => x.points), hits = sum(d, (x) => x.hit);
    return { m, d, pts, net: pts - hits, hits, tx: sum(d, (x) => regularTx(x)), bench: sum(d, (x) => x.bench), chips: d.filter((x) => x.chip).map((x, i) => x.chip), tiebreak: m.rank,
      sortVals: { net: pts - hits, pts, avg: pts / (d.length || 1), hits, tx: sum(d, (x) => regularTx(x)), bench: sum(d, (x) => x.bench), rank: m.rank, ...Object.fromEntries(gws.map((g) => ['g' + g, m.gw[g]?.points])) } };
  });
  const best = rows.slice().sort((a, b) => b.net - a.net)[0];
  const worst = rows.slice().sort((a, b) => a.net - b.net)[0];
  const winsIn = new Map();
  for (const w of S.motw.filter((x) => gws.includes(x.gw))) for (const r of w.winners) winsIn.set(r.m.id, (winsIn.get(r.m.id) || 0) + 1);
  view.innerHTML = `
  <section class="hero">
    <div><h1>Last 5 gameweeks</h1><p>Form table for GW${gws[0]}–GW${gws[gws.length - 1]}. Who's hot and who's not.</p></div>
    <div class="hero-stats">
      <div class="hs"><small>In form</small><b>${best.net}</b><span>${esc(best.m.team)} · ${esc(best.m.name)}</span></div>
      <div class="hs"><small>Out of form</small><b>${worst.net}</b><span>${esc(worst.m.team)} · ${esc(worst.m.name)}</span></div>
      <div class="hs"><small>League average</small><b>${Math.round(avg(rows.map((r) => r.net)))}</b><span>points over 5 gameweeks</span></div>
      <div class="hs"><small>MOTW winners</small><b>${winsIn.size}</b><span>${[...winsIn.keys()].map((id) => esc(S.byId.get(id).name)).join(', ')}</span></div>
    </div>
  </section>
  <section class="card">
    <div class="card-h"><h2>Form table</h2><p>Net is points minus transfer hits. Cells are green above that week's league average and red below. Tap a heading to sort.</p></div>
    <div class="table-tools">${myTeamSelect(S)}</div>
    <div class="tw"><table id="form">
      <thead><tr><th class="l">#</th><th class="l">Team</th>${gws.map((g) => `<th data-sort="g${g}">GW${g}</th>`).join('')}<th data-sort="net">Net</th><th data-sort="avg">Avg</th><th data-sort="hits">Hits</th><th data-sort="tx">Transfers</th><th data-sort="bench">Bench</th><th class="l">Chips</th><th data-sort="rank" data-asc="1">League pos</th></tr></thead>
      <tbody></tbody></table></div>
  </section>`;
  sortable(view.querySelector('#form'), rows, (rs) => rs.map((r, i) => `
    <tr data-m="${r.m.id}" class="${r.m.id === me ? 'me' : ''}">
      <td class="l muted">${i + 1}</td>${teamCell(r.m)}
      ${gws.map((g) => { const d = r.m.gw[g]; return d ? `<td style="${heatStyle(S, g, d.points)}"><b class="num" style="font-size:16px">${d.points}</b>${d.chip ? `<br><span class="pill chip">${esc(chipName(d.chip))}</span>` : ''}${d.hit ? `<br><span class="small" style="color:var(--down)">−${d.hit}</span>` : ''}</td>` : '<td>–</td>'; }).join('')}
      <td class="big">${r.net}</td><td>${(r.pts / (r.d.length || 1)).toFixed(1)}</td><td>${r.hits ? '−' + r.hits : 0}</td><td>${r.tx}</td><td>${r.bench}</td>
      <td class="l small">${r.chips.map((c) => esc(chipName(c))).join(', ') || '<span class="muted">–</span>'}</td><td>${r.m.rank}</td>
    </tr>`).join(''), { key: 'net', dir: -1 });
  bindMyTeam();
}

function pageStats(S) {
  setTab('stats');
  const all = S.managers.flatMap((m) => S.gws.filter((g) => m.gw[g]).map((g) => ({ m, g, d: m.gw[g] })));
  const hi = all.slice().sort((a, b) => b.d.points - a.d.points)[0];
  const lo = all.slice().sort((a, b) => a.d.points - b.d.points)[0];
  const agg = S.managers.map((m) => {
    const d = Object.values(m.gw);
    return { m, bench: sum(d, (x) => x.bench), hits: sum(d, (x) => x.hit), tx: sum(d, (x) => regularTx(x)), value: d.length ? d[d.length - 1].value : 0, orank: d.length ? d[d.length - 1].orank : null, wins: S.motw.filter((w) => w.final && w.winners.some((r) => r.m.id === m.id)).length, above: S.gws.filter((g) => m.gw[g] && m.gw[g].points > S.gwAvg[g]).length };
  });
  const top = (k) => agg.slice().sort((a, b) => b[k] - a[k] || a.m.rank - b.m.rank)[0];
  const rec = (label, value, unit, who, sub) => `<div class="rec"><small>${label}</small><b>${value}<i>${unit}</i></b><span>${esc(who.team)}</span><em>${esc(who.name)}${sub ? ' · ' + sub : ''}</em></div>`;
  const bestOR = agg.filter((a) => a.orank).sort((a, b) => a.orank - b.orank)[0];
  const me = myTeam();
  view.innerHTML = `
  <section class="card">
    <div class="card-h"><h2>League records</h2><p>Season so far, up to GW${S.curGW}.</p></div>
    <div class="card-b grid4">
      ${rec('Highest GW score', hi.d.points, 'pts', hi.m, `GW${hi.g}${hi.d.chip ? ' · ' + chipName(hi.d.chip) : ''}`)}
      ${rec('Lowest GW score', lo.d.points, 'pts', lo.m, `GW${lo.g}`)}
      ${rec('Most MOTW wins', top('wins').wins, 'wins', top('wins').m)}
      ${rec('Best overall rank', num(bestOR?.orank), '', bestOR.m)}
      ${rec('Most points on bench', top('bench').bench, 'pts', top('bench').m)}
      ${rec('Most points lost to hits', top('hits').hits, 'pts', top('hits').m)}
      ${rec('Most regular transfers', top('tx').tx, '', top('tx').m)}
      ${rec('Highest team value', '£' + top('value').value.toFixed(1), 'm', top('value').m)}
      ${rec('Most weeks above average', top('above').above, `of ${S.gws.length}`, top('above').m)}
    </div>
  </section>
  <section class="card">
    <div class="card-h"><h2>Title race</h2><p>Points behind the league leader after each gameweek. Highlighted: the current top 5${me ? ' and your team' : ''}. Pick your team on the Standings page to add it.</p></div>
    <div class="card-b"><div class="legend" id="race-legend"></div><div class="chart" id="race"></div></div>
  </section>
  <section class="card">
    <div class="card-h"><h2>League position by gameweek</h2><p>Where each manager sat in the league after every gameweek, with weekly scores coloured against the league average. The outlined score was the week's best.</p></div>
    <div class="tw"><table class="heat">
      <thead><tr><th class="l">Team</th>${S.gws.map((g) => `<th>GW${g}</th>`).join('')}</tr></thead>
      <tbody>${S.managers.slice().sort((a, b) => a.rank - b.rank).map((m) => `<tr data-m="${m.id}" class="${m.id === me ? 'me' : ''}">${teamCell(m)}${S.gws.map((g) => {
        const d = m.gw[g];
        if (!d) return '<td class="c">–</td>';
        return `<td class="c ${d.points === S.gwMax[g] ? 'win' : ''}"><span style="${heatStyle(S, g, d.points)}" title="GW${g}: ${d.points} pts, ${ordinal(d.lrank)} in league${d.chip ? ', ' + chipName(d.chip) : ''}">${d.points}</span><br><span class="small muted">${ordinal(d.lrank)}</span></td>`;
      }).join('')}</tr>`).join('')}</tbody></table></div>
  </section>
  <section class="card">
    <div class="card-h"><h2>Chips used</h2><p>Which chips each manager has played and when. FPL gives each chip once in each half of the season.</p></div>
    <div class="tw"><table>
      <thead><tr><th class="l">Team</th>${Object.keys(CHIP_NAMES).filter((k) => k !== 'manager').map((k) => `<th class="l">${chipName(k)}</th>`).join('')}</tr></thead>
      <tbody>${S.managers.slice().sort((a, b) => a.rank - b.rank).map((m) => `<tr data-m="${m.id}" class="${m.id === me ? 'me' : ''}">${teamCell(m)}${['wildcard', 'freehit', '3xc', 'bboost'].map((k) => {
        const c = m.chips.filter((x) => x.name === k);
        return `<td class="l">${c.length ? c.map((x) => `<span class="pill chip">GW${x.event} · ${m.gw[x.event]?.points ?? '–'}</span>`).join(' ') : '<span class="muted">Not used</span>'}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table></div>
  </section>`;
  bindRowLinks();
  const hl = S.managers.filter((m) => m.rank <= 5 || m.id === me).sort((a, b) => a.rank - b.rank);
  const color = new Map(hl.map((m, i) => [m.id, PALETTE[i % PALETTE.length]]));
  const leaderTot = Object.fromEntries(S.gws.map((g) => [g, Math.max(...S.managers.filter((m) => m.gw[g]).map((m) => m.gw[g].total))]));
  const series = S.managers.map((m) => ({
    name: m.team, color: color.get(m.id) || 'var(--muted)', muted: !color.has(m.id), width: color.has(m.id) ? 3 : 1.2,
    label: color.has(m.id) ? m.name.split(' ')[0] : null,
    points: S.gws.filter((g) => m.gw[g]).map((g) => ({ x: g, y: leaderTot[g] - m.gw[g].total, tip: `<b>${esc(m.team)}</b>${esc(m.name)}<br>GW${g}: ${num(m.gw[g].total)} pts · ${leaderTot[g] - m.gw[g].total ? (leaderTot[g] - m.gw[g].total) + ' behind' : 'leading'} · ${ordinal(m.gw[g].lrank)}` })),
  }));
  document.getElementById('race-legend').innerHTML = hl.map((m) => `<span><i style="background:${color.get(m.id)}"></i>${esc(m.team)}</span>`).join('');
  const draw = () => { const el = document.getElementById('race'); if (el) lineChart(el, series, { invert: true, y0: 0, height: 340, fmtY: (v) => (v ? '−' + v : '0'), label: 'Points behind the leader by gameweek' }); };
  draw();
  onResize(draw);
}

async function pagePlayers(S) {
  setTab('players');
  const g = S.curGW;
  view.innerHTML = `<div class="loading"><span class="spinner"></span>Loading every team for GW${g}…</div>`;
  const [picks, liveRaw] = await Promise.all([
    Promise.all(S.managers.map((m) => api(`entry/${m.id}/event/${g}/picks`).then((p) => ({ m, p })).catch(() => null))),
    api(`event/${g}/live`),
  ]);
  if (currentRoute().name !== 'players') return;
  const live = liveMap(liveRaw);
  const own = new Map();
  const n = picks.filter(Boolean).length;
  for (const x of picks.filter(Boolean)) {
    for (const pk of x.p.picks) {
      const o = own.get(pk.element) || { owners: [], starters: 0, caps: 0, mult: 0 };
      o.owners.push(x.m); if (pk.multiplier > 0) o.starters++; if (pk.is_captain) o.caps++; o.mult += pk.multiplier;
      own.set(pk.element, o);
    }
  }
  const rows = [...own.entries()].map(([id, o]) => {
    const p = S.players.get(id); const t = S.teams.get(p.team);
    const pts = live.get(id)?.total_points ?? 0;
    return { id, p, t, o, pts, tiebreak: -o.owners.length, sortVals: { own: o.owners.length, caps: o.caps, eo: o.mult / n, gw: pts, total: p.total_points, price: p.now_cost, form: Number(p.form) } };
  });
  const capTop = rows.slice().sort((a, b) => b.o.caps - a.o.caps)[0];
  const best = rows.slice().sort((a, b) => b.pts - a.pts)[0];
  const diffs = rows.filter((r) => r.o.owners.length <= 2).sort((a, b) => b.pts - a.pts)[0];
  view.innerHTML = `
  <section class="hero">
    <div><h1>Players</h1><p>Every player in at least one of the ${n} league teams for GW${g}, with live points. Effective ownership (EO) counts captains twice and Triple Captains three times, so it shows how much a player's points move the league.</p></div>
    <div class="hero-stats">
      <div class="hs"><small>Most captained</small><b>${esc(capTop?.p.web_name)}</b><span>${capTop?.o.caps} of ${n} managers</span></div>
      <div class="hs"><small>Top scorer in league teams</small><b>${esc(best?.p.web_name)}</b><span>${best?.pts} pts · owned by ${best?.o.owners.length}</span></div>
      <div class="hs"><small>Best differential</small><b>${esc(diffs?.p.web_name || '–')}</b><span>${diffs ? `${diffs.pts} pts · owned by ${diffs.o.owners.length}` : ''}</span></div>
      <div class="hs"><small>Players used</small><b>${rows.length}</b><span>across ${n} squads</span></div>
    </div>
  </section>
  <section class="card">
    <div class="card-h"><h2>League ownership · GW${g}</h2><p>Tap a player for their season stats and who owns them.</p></div>
    <div class="table-tools">
      <input type="search" id="psearch" placeholder="Search player or club" aria-label="Search players">
      <select id="ppos" aria-label="Position"><option value="">All positions</option><option value="1">Goalkeepers</option><option value="2">Defenders</option><option value="3">Midfielders</option><option value="4">Forwards</option></select>
    </div>
    <div class="tw"><table id="ptab"><thead><tr><th class="l">Player</th><th class="l">Pos</th><th data-sort="price">£</th><th data-sort="own">Owned</th><th data-sort="eo">EO</th><th data-sort="caps">(C)</th><th data-sort="gw">GW${g}</th><th data-sort="form" class="hide-sm">Form</th><th data-sort="total">Total</th></tr></thead><tbody></tbody></table></div>
  </section>`;
  const filt = () => {
    const q = view.querySelector('#psearch').value.trim().toLowerCase();
    const pos = view.querySelector('#ppos').value;
    return rows.filter((r) => (!pos || String(r.p.element_type) === pos) && (!q || (r.p.web_name + ' ' + r.p.first_name + ' ' + r.p.second_name + ' ' + r.t.name + ' ' + r.t.short_name).toLowerCase().includes(q)));
  };
  const renderRows = (rs) => rs.map((r) => { const cc = clubColor(r.t); return `
    <tr data-p="${r.id}" class="click" tabindex="0">
      <td class="l"><span style="display:inline-flex;align-items:center;gap:8px"><span class="shirt" style="width:28px;height:28px;font-size:10px;border-width:1px;background:${cc.bg};color:${cc.fg}">${esc(r.t.short_name)}</span><span><span class="tm">${esc(r.p.web_name)}</span><span class="mg">${esc(r.t.name)}</span></span></span></td>
      <td class="l">${S.posName[r.p.element_type]}</td><td>${(r.p.now_cost / 10).toFixed(1)}</td>
      <td>${r.o.owners.length} <span class="muted small">${Math.round((100 * r.o.owners.length) / n)}%</span></td>
      <td>${Math.round((100 * r.o.mult) / n)}%</td><td>${r.o.caps || '–'}</td><td class="big">${r.pts}</td><td class="hide-sm">${esc(r.p.form)}</td><td>${r.p.total_points}</td>
    </tr>`; }).join('');
  let state = { key: 'own', dir: -1 };
  const paint = () => {
    const t = view.querySelector('#ptab');
    const clone = t.cloneNode(true); t.replaceWith(clone);
    sortable(clone, filt(), renderRows, state);
    clone.querySelectorAll('th[data-sort]').forEach((th) => th.addEventListener('click', () => { state = { key: th.dataset.sort, dir: th.classList.contains('asc') ? 1 : -1 }; }));
    clone.addEventListener('click', (e) => { const tr = e.target.closest('tr[data-p]'); if (tr) playerModal(S, Number(tr.dataset.p), own.get(Number(tr.dataset.p)), live, n); });
    clone.addEventListener('keydown', (e) => { const tr = e.target.closest('tr[data-p]'); if (tr && e.key === 'Enter') playerModal(S, Number(tr.dataset.p), own.get(Number(tr.dataset.p)), live, n); });
  };
  view.querySelector('#psearch').addEventListener('input', paint);
  view.querySelector('#ppos').addEventListener('change', paint);
  paint();
}

function playerModal(S, id, o, live, n) {
  const p = S.players.get(id); const t = S.teams.get(p.team); const st = live?.get(id) || {};
  const cc = clubColor(t);
  const box = (k, v) => `<div><small>${k}</small><b>${v}</b></div>`;
  openModal(`
    <div style="display:flex;gap:12px;align-items:center;margin-bottom:6px"><span class="shirt" style="background:${cc.bg};color:${cc.fg}">${esc(t.short_name)}</span>
    <div><h3 id="modal-title">${esc(p.web_name)}</h3><div class="muted">${esc(p.first_name)} ${esc(p.second_name)} · ${esc(t.name)} · ${S.posName[p.element_type]} · £${(p.now_cost / 10).toFixed(1)}m</div></div></div>
    ${p.news ? `<p class="small" style="color:var(--down)">${esc(p.news)}</p>` : ''}
    <div class="statgrid">
      ${box('GW' + S.curGW + ' pts', st.total_points ?? p.event_points)}${box('Total pts', p.total_points)}${box('Form', esc(p.form))}${box('Pts / game', esc(p.points_per_game))}
      ${box('Minutes', num(p.minutes))}${box('Goals', p.goals_scored)}${box('Assists', p.assists)}${box('Clean sheets', p.clean_sheets)}
      ${box('Bonus', p.bonus)}${box('xG', esc(p.expected_goals))}${box('xA', esc(p.expected_assists))}${box('Def. contrib.', p.defensive_contribution ?? '–')}
      ${box('Saves', p.saves)}${box('Cards', `${p.yellow_cards}Y ${p.red_cards}R`)}${box('FPL owned', esc(p.selected_by_percent) + '%')}${box('League owned', o ? `${o.owners.length}/${n}` : '0')}
    </div>
    ${o ? `<h4 style="margin:6px 0">Owned by</h4><p class="small" style="margin:0">${o.owners.map((m) => `<a href="#/manager/${m.id}">${esc(m.name)}</a>`).join(', ')}</p>` : ''}`);
}

function openModal(html) {
  const m = document.getElementById('modal');
  document.getElementById('modal-body').innerHTML = html;
  m.hidden = false;
  document.getElementById('modal-close').focus();
}
function closeModal() { document.getElementById('modal').hidden = true; }
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal').addEventListener('click', (e) => { if (e.target.id === 'modal' || e.target.closest('#modal-body a')) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

async function pageManager(S, id) {
  setTab('');
  const m = S.byId.get(id);
  if (!m) { view.innerHTML = `<div class="error"><b>That manager isn't in this league.</b><a class="btn" href="#/">Back to standings</a></div>`; return; }
  const g = S.curGW;
  const gws = S.gws;
  const last = m.gw[gws[gws.length - 1]] || {};
  const mt = moneyTable(S).find((x) => x.m.id === id);
  const motwWins = S.motw.filter((w) => w.final && w.winners.some((r) => r.m.id === id));
  view.innerHTML = `
  <section class="mhead">
    <a class="back" href="#/">← Standings</a>
    <div><h1>${esc(m.team)}</h1><div style="color:rgba(255,255,255,.8)">${esc(m.name)}</div></div>
    <div class="kv">
      <div><small>League position</small><b>${ordinal(m.rank)}</b></div>
      <div><small>Total</small><b>${num(m.total)}</b></div>
      <div><small>GW${g}</small><b>${m.gwPts}</b></div>
      <div><small>Overall rank</small><b>${num(last.orank)}</b></div>
      <div><small>Team value</small><b>£${(last.value || 0).toFixed(1)}m</b></div>
      <div><small>In the bank</small><b>£${(last.bank || 0).toFixed(1)}m</b></div>
      <div><small>MOTW wins</small><b>${motwWins.length}</b></div>
      <div><small>Prize money</small><b>${money(mt?.total || 0)}</b></div>
    </div>
  </section>
  <div class="grid2">
    <section class="card"><div class="card-h"><h2>GW${g} team</h2><p id="team-note">Live points from FPL. Tap a player for their stats.</p></div><div class="card-b" id="pitch"><div class="loading"><span class="spinner"></span>Loading team…</div></div></section>
    <section class="card"><div class="card-h"><h2>Points by gameweek</h2><p>Bars are this manager's score; the line is the league average.</p></div><div class="card-b"><div class="chart" id="mbar"></div><div class="legend" style="margin-top:8px"><span><i style="background:var(--pink)"></i>${esc(m.name.split(' ')[0])}</span><span><i style="background:var(--purple)"></i>Chip week</span><span><i style="background:var(--muted)"></i>League average</span></div></div></section>
  </div>
  <section class="card"><div class="card-h"><h2>League position over the season</h2></div><div class="card-b"><div class="chart" id="mrank"></div></div></section>
  <section class="card">
    <div class="card-h"><h2>Gameweek history</h2><p>Captain points include the multiplier. Best pick is the top scorer in the starting XI that week.</p></div>
    <div class="tw"><table id="mhist"><thead><tr><th class="l">GW</th><th>Pts</th><th>Hits</th><th>League</th><th class="hide-sm">Overall</th><th>Transfers</th><th>Bench</th><th class="l">Captain</th><th class="l hide-sm">Best pick</th><th class="l">Chip</th></tr></thead>
    <tbody>${gws.slice().reverse().map((x) => { const d = m.gw[x]; if (!d) return ''; const w = S.motw.find((q) => q.gw === x); const won = w && w.winners.some((r) => r.m.id === id); return `
      <tr data-gw="${x}"><td class="l">GW${x}${won ? ' <span class="pill final">MOTW</span>' : ''}</td><td class="big" style="${heatStyle(S, x, d.points)}">${d.points}</td><td>${d.hit ? '−' + d.hit : '–'}</td><td>${ordinal(d.lrank)}</td><td class="hide-sm">${num(d.orank)}</td><td>${regularTx(d)}${d.chip === 'wildcard' || d.chip === 'freehit' ? ' <span class="muted small">+chip</span>' : ''}</td><td>${d.bench}</td><td class="l cap">…</td><td class="l hide-sm best">…</td><td class="l">${d.chip ? `<span class="pill chip">${esc(chipName(d.chip))}</span>` : ''}</td></tr>`; }).join('')}</tbody></table></div>
  </section>
  <div class="grid2">
    <section class="card"><div class="card-h"><h2>Transfers</h2><p>Most recent first.</p></div><div class="card-b" id="mtx"><div class="loading"><span class="spinner"></span></div></div></section>
    <section class="card"><div class="card-h"><h2>Chips & past seasons</h2></div><div class="card-b">
      ${m.chips.length ? `<ul class="rules">${m.chips.map((c) => `<li><b>${esc(chipName(c.name))}</b>, GW${c.event}: ${m.gw[c.event]?.points ?? '–'} pts that week</li>`).join('')}</ul>` : '<p class="muted">No chips played yet.</p>'}
      ${m.past.length ? `<div class="tw" style="margin-top:12px"><table><thead><tr><th class="l">Season</th><th>Points</th><th>Overall rank</th></tr></thead><tbody>${m.past.slice().reverse().map((p) => `<tr><td class="l">${esc(p.season_name)}</td><td>${num(p.total_points)}</td><td>${num(p.rank)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small" style="margin-top:12px">No earlier FPL seasons.</p>'}
    </div></section>
  </div>`;

  // Charts
  const drawCharts = () => {
    const bar = document.getElementById('mbar');
    if (bar) barChart(bar, gws.map((x) => ({ x, y: m.gw[x]?.points ?? 0, avg: S.gwAvg[x], chip: m.gw[x]?.chip })), 'Points per gameweek');
    const rk = document.getElementById('mrank');
    if (rk) lineChart(rk, [{ name: m.team, color: 'var(--pink)', width: 3, points: gws.filter((x) => m.gw[x]).map((x) => ({ x, y: m.gw[x].lrank, tip: `<b>GW${x}</b>${ordinal(m.gw[x].lrank)} in league · ${num(m.gw[x].total)} pts` })) }], { invert: true, y0: 1, height: 220, fmtY: (v) => ordinal(Math.round(v)), label: 'League position by gameweek' });
  };
  drawCharts();
  onResize(drawCharts);

  // Current team + live points
  try {
    const [pk, liveRaw] = await Promise.all([api(`entry/${id}/event/${g}/picks`), api(`event/${g}/live`)]);
    if (currentRoute().arg !== String(id)) return;
    const live = liveMap(liveRaw);
    renderPitch(S, pk, live);
  } catch (e) {
    const el = document.getElementById('pitch'); if (el) el.innerHTML = `<p class="muted">Couldn't load this team: ${esc(e.message)}</p>`;
  }

  // Transfers
  api(`entry/${id}/transfers`).then((tx) => {
    const el = document.getElementById('mtx'); if (!el) return;
    if (!tx.length) { el.innerHTML = '<p class="muted">No transfers yet.</p>'; return; }
    const byGw = new Map(); for (const t of tx) { if (!byGw.has(t.event)) byGw.set(t.event, []); byGw.get(t.event).push(t); }
    el.innerHTML = [...byGw.entries()].sort((a, b) => b[0] - a[0]).slice(0, 8).map(([ev, list]) => `
      <h4 style="margin:10px 0 6px">GW${ev}${m.gw[ev]?.chip === 'wildcard' || m.gw[ev]?.chip === 'freehit' ? ` <span class="pill chip">${esc(chipName(m.gw[ev].chip))}</span>` : ''}${m.gw[ev]?.hit ? ` <span class="small" style="color:var(--down)">−${m.gw[ev].hit} hit</span>` : ''}</h4>
      <div class="tx">${list.map((t) => `<span class="in">→ ${esc(S.players.get(t.element_in)?.web_name || '?')} <span class="muted small">£${(t.element_in_cost / 10).toFixed(1)}</span></span><span class="out">← ${esc(S.players.get(t.element_out)?.web_name || '?')} <span class="muted small">£${(t.element_out_cost / 10).toFixed(1)}</span></span>`).join('')}</div>`).join('')
      + (byGw.size > 8 ? `<p class="muted small">Showing the last 8 gameweeks with transfers (${tx.length} in total).</p>` : '');
  }).catch((e) => { const el = document.getElementById('mtx'); if (el) el.innerHTML = `<p class="muted">Couldn't load transfers: ${esc(e.message)}</p>`; });

  // Captain and best pick for each gameweek
  const rowsEl = document.querySelectorAll('#mhist tr[data-gw]');
  await Promise.all([...rowsEl].map(async (tr) => {
    const x = Number(tr.dataset.gw);
    try {
      const [pk, lv] = await Promise.all([api(`entry/${id}/event/${x}/picks`), api(`event/${x}/live`)]);
      const live = liveMap(lv);
      const cap = pk.picks.find((p) => p.is_captain), vice = pk.picks.find((p) => p.is_vice_captain);
      let who = cap; if (S.finished.has(x) && (live.get(cap.element)?.minutes || 0) === 0 && vice) who = vice;
      const mult = pk.active_chip === '3xc' ? 3 : 2;
      const cp = (live.get(who.element)?.total_points || 0);
      const xi = pk.picks.filter((p) => p.position <= 11);
      const best = xi.reduce((a, b) => ((live.get(b.element)?.total_points || 0) > (live.get(a.element)?.total_points || 0) ? b : a));
      const bp = live.get(best.element)?.total_points || 0;
      tr.querySelector('.cap').innerHTML = `${esc(S.players.get(who.element)?.web_name)}${who === vice ? ' <span class="muted small">(vice)</span>' : ''} <b>${cp * mult}</b>`;
      tr.querySelector('.best').innerHTML = `${esc(S.players.get(best.element)?.web_name)} ${bp}${best.element === who.element ? ' <span class="pill final">✓</span>' : ''}`;
    } catch { tr.querySelector('.cap').textContent = '–'; tr.querySelector('.best').textContent = '–'; }
  }));
}

function renderPitch(S, pk, live) {
  const el = document.getElementById('pitch'); if (!el) return;
  const card = (p) => {
    const pl = S.players.get(p.element); const t = S.teams.get(pl.team); const cc = clubColor(t);
    const st = live.get(p.element) || {};
    const pts = (st.total_points || 0) * (p.multiplier || 1);
    return `<button type="button" class="pl" data-p="${p.element}" aria-label="${esc(pl.web_name)}, ${pts} points">
      <span class="shirt" style="background:${cc.bg};color:${cc.fg}">${esc(t.short_name)}${p.is_captain ? `<span class="cap">${p.multiplier === 3 ? 'TC' : 'C'}</span>` : p.is_vice_captain ? '<span class="cap v">V</span>' : ''}</span>
      <span class="pname">${esc(pl.web_name)}</span><span class="ppts">${p.position > 11 && pk.active_chip !== 'bboost' ? st.total_points || 0 : pts}</span></button>`;
  };
  const xi = pk.picks.filter((p) => p.position <= 11);
  const rows = [1, 2, 3, 4].map((tp) => xi.filter((p) => S.players.get(p.element)?.element_type === tp));
  const bench = pk.picks.filter((p) => p.position > 11);
  const subs = (pk.automatic_subs || []).map((s) => `${S.players.get(s.element_out)?.web_name} → ${S.players.get(s.element_in)?.web_name}`);
  el.innerHTML = `<div class="pitch">${rows.map((r) => `<div class="prow">${r.map(card).join('')}</div>`).join('')}
    <div class="bench"><h4>Bench${pk.active_chip === 'bboost' ? ' (Bench Boost)' : ''}</h4><div class="prow">${bench.map(card).join('')}</div></div></div>
    <p class="small muted" style="margin:8px 0 0">${pk.entry_history ? `${pk.entry_history.points} pts this week${pk.entry_history.event_transfers_cost ? ` (−${pk.entry_history.event_transfers_cost} hit)` : ''}. ` : ''}${pk.active_chip ? `Chip: ${esc(chipName(pk.active_chip))}. ` : ''}${subs.length ? 'Auto-subs: ' + esc(subs.join(', ')) + '.' : ''}</p>`;
  el.querySelectorAll('.pl').forEach((b) => b.addEventListener('click', () => playerModal(S, Number(b.dataset.p), null, live, 0)));
}

function barChart(el, data, label) {
  const W = Math.max(300, el.clientWidth || 500), H = 220, m = { l: 30, r: 6, t: 8, b: 24 };
  const ymax = Math.max(10, ...data.map((d) => Math.max(d.y, d.avg || 0)));
  const step = niceStep(ymax / 4); const top = Math.ceil(ymax / step) * step;
  const bw = (W - m.l - m.r) / data.length;
  const Y = (v) => H - m.b - (v / top) * (H - m.t - m.b);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">`;
  for (let v = 0; v <= top; v += step) s += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${m.l - 6}" y="${Y(v)}" dy="0.32em" text-anchor="end">${v}</text>`;
  data.forEach((d, i) => {
    const x = m.l + i * bw;
    s += `<rect x="${x + bw * 0.15}" y="${Y(d.y)}" width="${bw * 0.7}" height="${Y(0) - Y(d.y)}" rx="3" fill="${d.chip ? 'var(--purple)' : 'var(--pink)'}" data-i="${i}"/>`;
    if (data.length <= 20 || i % 2 === 0) s += `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${d.x}</text>`;
  });
  s += `<path d="${data.map((d, i) => `${i ? 'L' : 'M'}${m.l + i * bw + bw / 2},${Y(d.avg || 0)}`).join('')}" fill="none" stroke="var(--muted)" stroke-width="2" stroke-dasharray="4 3"/>`;
  s += '</svg>';
  el.innerHTML = s;
  el.querySelectorAll('rect').forEach((r) => {
    const d = data[Number(r.dataset.i)];
    r.addEventListener('pointermove', (e) => showTip(`<b>GW${d.x}: ${d.y} pts</b>League average ${Math.round(d.avg)}${d.chip ? '<br>' + esc(chipName(d.chip)) : ''}`, e.clientX, e.clientY));
    r.addEventListener('pointerleave', hideTip);
  });
}

let resizeFns = [];
function onResize(fn) { resizeFns.push(fn); }
let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => resizeFns.forEach((f) => f()), 150); });

// ---------- router ----------
function currentRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  return { name: parts[0] || '', arg: parts[1] };
}
async function render() {
  hideTip(); closeModal(); resizeFns = [];
  const r = currentRoute();
  try {
    if (!C) {
      view.innerHTML = '<div class="loading"><span class="spinner"></span>Loading live data from FPL…</div>';
      await (loadingCore ||= loadCore().finally(() => { loadingCore = null; }));
    }
    updateStatus();
    const S = C;
    if (r.name === 'prizes') await pagePrizes(S);
    else if (r.name === 'form') pageForm(S);
    else if (r.name === 'stats') pageStats(S);
    else if (r.name === 'players') await pagePlayers(S);
    else if (r.name === 'manager') await pageManager(S, Number(r.arg));
    else pageHome(S);
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="error"><b>Couldn't load the league.</b><span>${esc(e.message)}</span><button class="btn" type="button" id="retry">Try again</button></div>`;
    document.getElementById('retry').onclick = () => refresh();
  }
}
function updateStatus() {
  const el = document.getElementById('status');
  if (!C) return;
  const live = C.cur && !C.finished.has(C.curGW);
  el.innerHTML = `${live ? '<span class="live">GW' + C.curGW + ' live</span>' : 'GW' + C.curGW + ' finished'}<br>Updated ${C.loadedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
}
async function refresh() {
  const b = document.getElementById('refresh');
  b.classList.add('spin');
  memo.clear();
  try { await loadCore(true); } catch (e) { /* render() shows the error */ C = null; }
  b.classList.remove('spin');
  const y = window.scrollY;
  await render();
  window.scrollTo(0, y);
}
document.getElementById('refresh').addEventListener('click', refresh);
window.addEventListener('hashchange', () => { render().then(() => { if (currentRoute().name === 'manager') window.scrollTo(0, 0); }); });
// While a gameweek is live, pull fresh numbers every 3 minutes when the tab is visible.
setInterval(() => { if (C && C.cur && !C.finished.has(C.curGW) && document.visibilityState === 'visible') refresh(); }, 180000);
render();
})();
