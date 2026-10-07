// Mass Poll front end: hash-routed, no framework, no build step.

import { drawCard, canvasToBlob } from './card.js';

const app = document.getElementById('app');
const nav = document.getElementById('nav');

const matchupsOf = (n) => (n * (n - 1)) / 2;
const factsLine = (options, min) => `${options} options · ${matchupsOf(options)} matchups · answer ${min} to contribute`;

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style') el.style.cssText = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
}

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'content-type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { status: res.status, data });
  return data;
}

function textOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#111' : '#fff';
}
// A rounded tile: the item's logo on white if it has one, else its initials/emoji on its colour.
const chip = (it) =>
  it.image
    ? h('span', { class: 'chip logo' }, h('img', { src: it.image, alt: '', loading: 'lazy', draggable: 'false' }))
    : h('span', { class: /[^ -~]/.test(it.short) ? 'chip emoji' : 'chip', style: `background:${it.color};color:${textOn(it.color)}` }, it.short);
const pct = (x) => Math.round(x * 100);

const coarsePointer = matchMedia('(pointer: coarse)').matches;

// Swipe the matchup like a card: left picks the left option, right picks the right one,
// down calls it a tie. Taps still work, and a swipe never also counts as a tap.
function attachSwipe(el, onChoose) {
  const COMMIT = 90;
  let start = null;
  let swiped = false;
  const lean = (dx, dy) =>
    dy > 40 && dy > Math.abs(dx) ? 'tie' : dx < -20 ? 'a' : dx > 20 ? 'b' : '';
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || e.target.closest('.dk')) return;
    start = { x: e.clientX, y: e.clientY };
    swiped = false;
  });
  el.addEventListener('pointermove', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) swiped = true;
    el.style.transition = 'none';
    el.style.transform = `translate(${dx * 0.5}px, ${Math.max(0, dy) * 0.3}px) rotate(${dx / 40}deg)`;
    el.dataset.lean = lean(dx, dy);
  });
  const finish = (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    start = null;
    el.style.transition = '';
    el.style.transform = '';
    el.dataset.lean = '';
    if (Math.abs(dx) >= COMMIT && Math.abs(dx) > dy) onChoose(dx < 0 ? 'a' : 'b');
    else if (dy >= COMMIT && dy > Math.abs(dx)) onChoose('tie');
  };
  el.addEventListener('pointerup', finish);
  el.addEventListener('pointercancel', () => {
    start = null;
    el.style.transition = '';
    el.style.transform = '';
    el.dataset.lean = '';
  });
  el.addEventListener('click', (e) => {
    if (swiped) (e.stopPropagation(), e.preventDefault());
    swiped = false;
  }, true);
}

let teardown = null;
function mount(...nodes) {
  app.classList.remove('is-voting');
  if (teardown) (teardown(), (teardown = null));
  app.replaceChildren(...nodes);
  window.scrollTo(0, 0);
}

// ---------- home ----------

async function home() {
  nav.replaceChildren();
  const { polls } = await api('/polls');
  mount(
    h('h1', {}, 'Settle it with many small votes'),
    h('p', { class: 'muted' }, 'Instead of picking one favourite, you answer a quick run of head-to-head questions. Every answer sharpens the ranking.'),
    h('div', { class: 'polls' }, polls.map((p) =>
      h('a', { class: 'poll-card', href: `#/p/${p.slug}` },
        h('div', { class: 'preview', 'aria-hidden': 'true' }, p.preview.map(chip)),
        h('h3', {}, p.title),
        h('div', { class: 'muted' }, p.description),
        h('div', { class: 'muted small' }, `${p.items} options · ${matchupsOf(p.items)} matchups · ${p.votes.toLocaleString()} votes cast`)),
    )),
  );
}

// ---------- voting ----------

async function poll(slug, view) {
  const { poll: p, progress: prog0 } = await api(`/polls/${slug}`);
  nav.replaceChildren(
    h('a', { href: `#/p/${slug}`, class: 'link-btn' }, 'Vote'),
    ' ',
    h('a', { href: `#/p/${slug}/results`, class: 'link-btn' }, 'Results'),
  );
  if (view === 'results') return results(p, prog0);
  return vote(p, prog0);
}

async function vote(p, prog0) {
  let progress = prog0;
  let started = progress.votes > 0;
  let busy = false;
  let justUnlocked = false;

  const stage = h('div');
  const barFill = h('i');
  const count = h('span', { class: 'count' });
  const progressEl = h('div', { class: 'progress' }, h('div', { class: 'bar' }, barFill), count);
  const banner = h('div');

  function paintProgress() {
    const base = Math.min(progress.votes, progress.min);
    barFill.style.transform = `scaleX(${base / progress.min})`;
    count.textContent = progress.unlocked
      ? `${progress.votes} votes counted`
      : `${progress.votes} / ${progress.min} to contribute`;
    if (progress.unlocked) {
      banner.replaceChildren(
        h('div', { class: 'banner' },
          h('span', {}, justUnlocked ? 'Your votes now count. Grab your card, or keep voting to sharpen it.' : 'Keep voting to sharpen the ranking.'),
          h('a', { class: 'btn primary', href: `#/p/${p.slug}/results` }, 'See my card')),
      );
    } else banner.replaceChildren();
  }

  function intro() {
    stage.replaceChildren(
      h('div', { class: 'notice' },
        h('p', { style: 'margin-top:0' }, `You'll get a series of two-way matchups. Pick the one you prefer. Your votes count once you've answered ${progress.min} (about two minutes), and that gets you a shareable card of your ranking next to the crowd's. Keep going as long as you like.`),
        h('p', { class: 'muted' }, 'Can\'t separate two options? Choose "Tie". Never heard of one? Choose "Don\'t know" on it. It stays out of your matchups and doesn\'t count against it.'),
        h('button', { class: 'btn primary', onclick: () => ((started = true), app.classList.add('is-voting'), next()) }, 'Start')),
    );
  }

  const FEEDBACK_MS = 380;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const history = []; // answers this session, newest last, so "Back" can undo them
  let duelEl = null;
  let current = null;

  // Show which side was picked (a / b / tie) while the answer is saved.
  function showPicked(side) {
    if (duelEl) duelEl.dataset.picked = side;
  }

  async function answer(a, b, winner) {
    if (busy) return;
    busy = true;
    // Sides as shown on screen (left = shown.a), whichever way the click handler passed them.
    const shown = current;
    showPicked(winner === 'tie' ? 'tie' : winner === shown.a.key ? 'a' : 'b');
    try {
      const wasUnlocked = progress.unlocked;
      const [res] = await Promise.all([
        api(`/polls/${p.slug}/votes`, { method: 'POST', body: { a: a.key, b: b.key, winner } }).catch((e) => {
          if (e.status === 409) return null;
          throw e;
        }),
        wait(FEEDBACK_MS),
      ]);
      if (res) {
        progress = res.progress;
        history.push({ type: 'vote', a: shown.a, b: shown.b });
        justUnlocked = progress.unlocked && !wasUnlocked;
        paintProgress();
      }
      await next();
    } catch (e) {
      showPicked('');
      throw e;
    } finally {
      busy = false;
    }
  }

  async function dontKnow(item, a, b) {
    if (busy) return;
    busy = true;
    try {
      await api(`/polls/${p.slug}/unknown`, { method: 'POST', body: { item: item.key } });
      history.push({ type: 'unknown', item, a, b });
      await next();
    } finally {
      busy = false;
    }
  }

  // Take back the last answer and show that same matchup again.
  async function undo() {
    if (busy || !history.length) return;
    busy = true;
    const last = history.pop();
    try {
      if (last.type === 'vote') {
        ({ progress } = await api(`/polls/${p.slug}/votes`, { method: 'DELETE', body: { a: last.a.key, b: last.b.key } }));
      } else {
        await api(`/polls/${p.slug}/unknown`, { method: 'DELETE', body: { item: last.item.key } });
        ({ progress } = await api(`/polls/${p.slug}`));
      }
      justUnlocked = false;
      paintProgress();
      showPair(last.a, last.b);
    } catch (e) {
      history.push(last);
      throw e;
    } finally {
      busy = false;
    }
  }

  const backButton = () =>
    h('button', {
      class: 'btn back', onclick: undo, disabled: history.length === 0, 'aria-label': 'Undo last answer', title: 'Undo last answer (Backspace)',
    }, '↶ Back');

  function showPair(a, b) {
    current = { a, b };
    const side = (it, other) =>
      h('div', { class: 'contender' },
        h('button', { class: 'pick', onclick: () => answer(it, other, it.key), 'aria-label': `Prefer ${it.name}` },
          h('span', { class: 'badge', 'aria-hidden': 'true' }, '✓'),
          chip(it), h('span', { class: 'name' }, it.name), h('span', { class: 'native' }, it.native)),
        h('button', { class: 'link-btn dk', onclick: () => dontKnow(it, a, b) }, "Don't know this one"));
    duelEl = h('div', { class: 'duel' }, side(a, b), side(b, a));
    attachSwipe(duelEl, (what) => answer(a, b, what === 'a' ? a.key : what === 'b' ? b.key : 'tie'));
    stage.replaceChildren(
      h('div', { class: 'question' }, p.question),
      duelEl,
      h('div', { class: 'tie-row' }, backButton(), h('button', { class: 'btn tie', onclick: () => answer(a, b, 'tie') }, "Tie: can't separate them")),
      h('div', { class: 'keys muted small' }, coarsePointer ? 'Tap one, or swipe: ← left · → right · ↓ tie' : '← left · → right · ↓ tie · Backspace undoes'),
      p.footnote && h('p', { class: 'muted small footnote' }, p.footnote),
    );
  }

  async function next() {
    const data = await api(`/polls/${p.slug}/next`);
    progress = data.progress;
    paintProgress();
    if (!data.pair) {
      current = null;
      duelEl = null;
      stage.replaceChildren(
        h('div', { class: 'notice' },
          h('b', {}, 'You\'ve covered every matchup you can judge.'),
          h('p', { class: 'muted' }, progress.unlocked ? 'Thanks. Your votes are in the ranking.' : 'You skipped too many to reach the minimum, so results stay locked for now.'),
          h('div', { class: 'card-actions' },
            progress.unlocked && h('a', { class: 'btn primary', href: `#/p/${p.slug}/results` }, 'See results'),
            backButton())),
      );
      return;
    }
    showPair(data.pair[0], data.pair[1]);
  }

  function onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Backspace') return (e.preventDefault(), undo());
    if (!current) return;
    if (e.key === 'ArrowLeft') answer(current.a, current.b, current.a.key);
    else if (e.key === 'ArrowRight') answer(current.a, current.b, current.b.key);
    else if (e.key === 'ArrowDown') (e.preventDefault(), answer(current.a, current.b, 'tie'));
  }
  window.addEventListener('keydown', onKey);

  mount(
    h('h1', {}, p.title),
    h('p', { class: 'muted' }, p.description),
    h('p', { class: 'facts' }, factsLine(p.items.length, progress.min)),
    progressEl, banner, stage,
  );
  teardown = () => window.removeEventListener('keydown', onKey);
  app.classList.toggle('is-voting', started);
  paintProgress();
  if (started) next();
  else intro();
}

// ---------- results ----------

async function results(p, prog) {
  if (!prog.unlocked) {
    return mount(
      h('h1', {}, p.title),
      h('div', { class: 'notice' },
        h('b', {}, `Answer ${prog.min} to contribute and see the results.`),
        h('p', { class: 'muted' }, `You've answered ${prog.votes} of ${prog.min}. Seeing the crowd's ranking first would sway your answers.`),
        h('a', { class: 'btn primary', href: `#/p/${p.slug}` }, 'Go vote')),
    );
  }

  let scope = 'card';
  const body = h('div');
  const tabs = h('div', { class: 'tabs' });
  const [all, me] = await Promise.all([
    api(`/polls/${p.slug}/results?scope=all`),
    api(`/polls/${p.slug}/results?scope=me`),
  ]);

  function paintTabs() {
    tabs.replaceChildren(
      ...[['card', 'Your card'], ['all', 'Everyone'], ['me', 'You']].map(([id, label]) =>
        h('button', { 'aria-pressed': String(scope === id), onclick: () => ((scope = id), paint()) }, label)),
    );
  }

  async function paint() {
    paintTabs();
    const nodes = (scope === 'card' ? await card(p, me, all) : scope === 'all' ? everyone(all, p) : you(me, p)).flat().filter(Boolean);
    body.replaceChildren(...nodes);
  }

  mount(
    h('h1', {}, p.title),
    h('p', { class: 'muted' }, p.question),
    h('div', { class: 'results-bar' }, tabs, h('a', { class: 'btn', href: `#/p/${p.slug}` }, '← Keep voting')),
    body,
  );
  paint();
}

async function card(p, me, all) {
  const link = `${location.host}/#/p/${p.slug}`;
  const canvas = await drawCard({ poll: p, mine: me.ranking, crowd: all.ranking, link });
  canvas.className = 'card-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `Your ranking of ${p.title} compared with the crowd`);
  const status = h('span', { class: 'muted small', role: 'status' });
  const file = `${p.slug}-my-ranking.png`;
  const canShareFiles = !!navigator.canShare?.({ files: [new File([''], file, { type: 'image/png' })] });

  async function download() {
    const blob = await canvasToBlob(canvas);
    const a = h('a', { href: URL.createObjectURL(blob), download: file });
    a.click();
    URL.revokeObjectURL(a.href);
  }
  async function share() {
    const blob = await canvasToBlob(canvas);
    const f = new File([blob], file, { type: 'image/png' });
    try {
      if (navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f], title: p.title, text: link });
      else if (navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        status.textContent = 'Image copied. Paste it anywhere.';
      } else status.textContent = 'Sharing isn\'t supported here. Use Download.';
    } catch (e) {
      if (e.name !== 'AbortError') status.textContent = 'Couldn\'t share. Use Download.';
    }
  }

  return [
    h('p', { class: 'muted small' }, `Based on your ${me.votes} votes. Green lines: you rank it higher than the crowd does. Red: lower.`),
    canvas,
    h('div', { class: 'card-actions' },
      h('button', { class: 'btn primary', onclick: download }, 'Download image'),
      h('button', { class: 'btn', onclick: share }, canShareFiles ? 'Share' : 'Copy image'),
      status),
  ];
}

function meter(row, lo, hi, scale) {
  const x = (v) => `${((v - scale.min) / (scale.max - scale.min)) * 100}%`;
  return h('div', { class: 'meter', 'aria-hidden': 'true' },
    h('div', { class: 'track' }),
    h('div', { class: 'mid', style: `left:${x(0.5)}` }),
    lo != null && h('div', { class: 'range', style: `left:${x(lo)};width:calc(${x(hi)} - ${x(lo)});background:${row.color}` }),
    h('div', { class: 'dot', style: `left:${x(row.score)};background:${row.color}` }));
}

function everyone(data, p) {
  const { ranking, totals, pairs, cycles } = data;
  const lows = ranking.map((r) => r.lo);
  const highs = ranking.map((r) => r.hi);
  const scale = {
    min: Math.max(0, Math.floor((Math.min(...lows) - 0.03) * 10) / 10),
    max: Math.min(1, Math.ceil((Math.max(...highs) + 0.03) * 10) / 10),
  };
  const byKey = new Map(ranking.map((r) => [r.key, r]));
  const sparse = totals.votes < 100;

  const list = h('ol', { class: 'rank-list' }, ranking.map((r) => {
    const tied = r.rankHi - r.rankLo;
    return h('li', { class: 'rank-row' },
      h('span', { class: 'no' }, r.rank),
      chip(r),
      h('div', { class: 'who' }, h('b', {}, r.name), h('span', {}, r.native)),
      meter(r, r.lo, r.hi, scale),
      h('div', { class: 'meter-label' },
        `${pct(r.score)}% chance to win a matchup (${pct(r.lo)}–${pct(r.hi)}) · plausible rank ${r.rankLo === r.rankHi ? r.rankLo : `${r.rankLo}–${r.rankHi}`}`,
        r.unknownRate >= 0.02 ? ` · ${pct(r.unknownRate)}% don't know it` : '',
        tied >= 3 ? ' · too close to place firmly' : ''));
  }));

  // head-to-head matrix: cell = row's win share against column (ties count half)
  const pairMap = new Map();
  for (const x of pairs) {
    pairMap.set(`${x.a}|${x.b}`, { share: (x.aWins + x.ties / 2) / x.n, n: x.n });
    pairMap.set(`${x.b}|${x.a}`, { share: (x.bWins + x.ties / 2) / x.n, n: x.n });
  }
  const matrix = h('table', { class: 'matrix' },
    h('thead', {}, h('tr', {}, h('th'), ranking.map((c) => h('th', {}, c.short)))),
    h('tbody', {}, ranking.map((r) =>
      h('tr', {}, h('th', {}, r.short), ranking.map((c) => {
        if (c.key === r.key) return h('td', { class: 'self' });
        const cell = pairMap.get(`${r.key}|${c.key}`);
        if (!cell) return h('td', { class: 'muted' }, '–');
        const edge = Math.min(0.6, Math.abs(cell.share - 0.5) * 2);
        const rgb = cell.share >= 0.5 ? 'var(--win)' : 'var(--lose)';
        return h('td', { style: `background:rgba(${rgb},${edge})`, title: `${r.name} vs ${c.name}: ${pct(cell.share)}% over ${cell.n} votes` },
          `${pct(cell.share)}`, h('small', {}, `n=${cell.n}`));
      })))));

  return [
    h('p', { class: 'stats muted small' },
      h('span', {}, `${totals.voters.toLocaleString()} voters`),
      h('span', {}, `${totals.votes.toLocaleString()} votes`),
      h('span', {}, `${pct(totals.tieRate)}% ties`)),
    sparse && h('div', { class: 'notice small' }, 'Still early: with this few votes the order can change a lot. The shaded ranges show how much.'),
    list,
    h('h2', {}, 'Head to head'),
    h('p', { class: 'muted small' }, 'Each cell is how often the row beat the column, in percent. Green means the row usually wins.'),
    h('div', { class: 'matrix-wrap' }, matrix),
    cycles.length > 0 && [
      h('h2', {}, 'No single "best"?'),
      h('p', { class: 'muted small' }, 'These trios beat each other in a circle, so the crowd doesn\'t have one clear order among them:'),
      h('ul', { class: 'cycles' }, cycles.slice(0, 5).map((c) =>
        h('li', {}, c.map((k) => byKey.get(k).name).join(' → ') + ' → ' + byKey.get(c[0]).name))),
    ],
    p.footnote && h('p', { class: 'muted small footnote' }, p.footnote),
  ];
}

function you(data) {
  const scale = { min: 0, max: 1 };
  return [
    h('p', { class: 'muted small' }, `Based on your ${data.votes} votes. A tie counts as half a win.`),
    h('ol', { class: 'rank-list' }, data.ranking.map((r, i) =>
      h('li', { class: 'rank-row' },
        h('span', { class: 'no' }, r.score == null ? '–' : i + 1),
        chip(r),
        h('div', { class: 'who' }, h('b', {}, r.name), h('span', {}, r.native)),
        r.score == null ? h('div', { class: 'muted small' }, r.unknown ? "You don't know this one" : 'Not matched up yet') : meter(r, null, null, scale),
        r.score != null && h('div', { class: 'meter-label' }, `${pct(r.score)}% of points over ${r.games} matchups`)))),
  ];
}

// ---------- router ----------

async function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  try {
    if (parts[0] === 'p' && parts[1]) await poll(parts[1], parts[2]);
    else await home();
  } catch (e) {
    mount(h('div', { class: 'notice' }, h('b', {}, 'Something went wrong.'), h('p', { class: 'muted' }, e.message)));
  }
}
window.addEventListener('hashchange', route);
route();
