// app/app.js — living brain shell (Forge). Wires notes in (text + voice), Engram's brain,
// Twelve's creature, and waystone's lines in kiln's voice. Store format: docs/NOTE_FORMAT.md.
import { createCreature } from '../viz/creature.js';
import {
  STORAGE_KEY, emptyStore, tick, clusterHunger, newNote, touch, suggestLinks, openSuggestion, confirmLink, rejectLink,
  detectContradictions, localJudge, openArgument, resolve, maybeName, speech, welcomeWellFed,
} from './store.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ago = iso => { const d = (Date.now() - Date.parse(iso)) / 1000; return d < 60 ? 'just now' : d < 3600 ? `${d / 60 | 0}m ago` : d < 86400 ? `${d / 3600 | 0}h ago` : `${d / 86400 | 0}d ago`; };

let store = emptyStore(), LINES = null, SEED = null;
let said = { key: '', text: '' }, held = false, openId = null, judge = localJudge;

const creature = createCreature($('creature'), { onNodeClick: n => openNote(n.id), inset: { right: 320 } });

// ---------- layout: keep the creature in the open column, bubble at its head ----------
const PANEL_W = 320, NARROW = 760;
const panelOpen = () => !document.body.classList.contains('panel-closed');
let insetPlaced = false;
function syncInset() { // viz/README.md: narrow screens have a 100vw panel and hide the dock while it is open
  const narrow = window.innerWidth <= NARROW;
  creature.setInset({ right: panelOpen() && !narrow ? PANEL_W : 0, bottom: document.querySelector('.dock')?.offsetHeight || 0 }, insetPlaced ? undefined : { immediate: true });
  insetPlaced = true;
}
function placeBubble() {
  const b = $('bubble'), vw = window.innerWidth, vh = window.innerHeight;
  const covered = panelOpen() && vw <= NARROW; // the panel fills the screen
  b.style.visibility = covered ? 'hidden' : '';
  if (covered) return;
  const ins = creature.getInset(), a = creature.getAnchor('head'), w = b.offsetWidth, h = b.offsetHeight, m = 12;
  const minX = ins.left + m, maxX = vw - ins.right - m, minY = 60, maxY = vh - ins.bottom - m;
  const anchored = !!(a && Number.isFinite(a.x) && Number.isFinite(a.y));
  let x = anchored ? a.x - w / 2 : (minX + maxX - w) / 2;   // no anchor yet: sit on the dock
  let y = anchored ? a.y - a.r - 14 - h : maxY - h;
  x = Math.min(Math.max(x, minX), Math.max(minX, maxX - w));
  y = Math.min(Math.max(y, minY), Math.max(minY, maxY - h));
  b.classList.toggle('docked', !anchored);
  b.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}
(function follow() { placeBubble(); requestAnimationFrame(follow); })();
window.addEventListener('resize', syncInset);
if (typeof ResizeObserver === 'function') new ResizeObserver(syncInset).observe(document.querySelector('.dock'));

// ---------- store ----------
function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch (e) { hint('could not save (storage full or blocked).'); } }
function loadSaved() { try { const s = JSON.parse(localStorage.getItem(STORAGE_KEY)); return s && Array.isArray(s.notes) ? { ...emptyStore(), ...s } : null; } catch { return null; } }
const fromSeed = () => JSON.parse(JSON.stringify({ ...emptyStore(), ...SEED }));

// tick on load, after every change, and every 30 s. Always hands the viz clusterHunger().
function refresh({ justAdded = false, lastNoteId = null, event = null, action = false, say = null } = {}) {
  const now = Date.now();
  store = tick(store, now, { justAdded });
  const hunger = clusterHunger(store, now);
  creature.update({ ...store, hunger, now });
  if (action) held = false;
  const next = say || speech(store, LINES, { hunger, event, lastNoteId });
  if (next.event) { // one-off lines hold, then lapse: greetings longer, after_no just a beat
    held = true; said = next;
    const long = next.key === 'welcome' || next.key === 'first_meal' || next.key === 'named';
    holdLine(next.key, long ? 20_000 : 8_000);
  }
  else if (!held && next.key !== said.key) said = next;
  store = { ...store, creature: { ...store.creature, says: said.text } };
  save();
  render(hunger);
}

// ---------- actions ----------
async function addNote(text, source) {
  const r = newNote(store, text, source);
  if (!r.note) return;
  store = suggestLinks(r.store, r.note.id).store;
  store = await detectContradictions(store, judge);
  const n = maybeName(store); store = n.store;
  refresh({ justAdded: true, lastNoteId: r.note.id, event: n.named ? 'named' : null, action: true });
}
async function onConfirm(id) { store = await detectContradictions(confirmLink(store, id), judge); refresh({ action: true }); }
function onReject(id) { store = rejectLink(store, id); refresh({ event: 'after_no', action: true }); }
function onResolve(cId, choice) {
  const merged = choice === 'merged' ? ($('merge-text')?.value || '') : '';
  store = resolve(store, cId, choice, merged);
  refresh({ action: true });
}
function openNote(id) {
  openId = id;
  store = touch(store, id); // opening a note feeds it
  document.body.classList.remove('panel-closed'); $('toggle-panel').setAttribute('aria-expanded', 'true'); syncInset();
  refresh();
}

// First run: a hatchling gets the first-meal greeting; a creature that opens well fed gets one
// welcome_well_fed line (once, flagged in creature.welcomed). Either holds until the first note or ~20 s.
let welcomeTimer = 0;
function holdLine(key, ms = 20_000) {
  clearTimeout(welcomeTimer);
  welcomeTimer = setTimeout(() => { if (said.key === key) { held = false; refresh(); } }, ms);
}
function firstRun() {
  held = false;
  store = tick(store, Date.now());
  const w = welcomeWellFed(store, LINES);
  if (w.said) { store = w.store; refresh({ say: w.said }); } else refresh({ event: 'first_meal' });
}

// ---------- render ----------
const title = id => store.notes.find(n => n.id === id)?.title || id;
function render() {
  const c = store.creature || {}, flags = Object.entries(c.flags || {}).filter(([, v]) => v === true).map(([k]) => k);
  $('says').textContent = said.text;
  $('mood').innerHTML = `${c.name ? `<span class="name">${esc(c.name)}</span> · ` : ''}${esc([c.mood, ...flags].filter(Boolean).join(' + '))} · ${esc((c.stage || '').replace('_', ' '))} · ${store.notes.length} notes`;
  renderCard(); renderList(); renderDetail();
}

function renderCard() {
  const card = $('card'), arg = openArgument(store), sug = arg ? null : openSuggestion(store);
  if (arg) {
    const a = store.notes.find(n => n.id === arg.a), b = store.notes.find(n => n.id === arg.b);
    const side = (n, cls, label) => `<div class="side ${cls}"><b>${esc(n.title)}</b><span>${esc(n.text)}</span><small>${label} · ${esc(n.createdAt.slice(0, 10))}</small></div>`;
    card.innerHTML = `<p class="why">these two disagree${arg.summary ? `: ${esc(arg.summary)}` : ''}. which one's true now?</p>
      <div class="pair">${side(a, 'a', 'older')}${side(b, 'b', 'newer')}</div>
      <textarea id="merge-text" rows="2" placeholder="to merge, write the one note that holds both (optional)" hidden></textarea>
      <div class="row">
        <button data-r="both_true">both true</button><button data-r="newer_wins" class="yes">newer wins</button>
        <button data-r="merged">merge</button><button data-r="not_now">not now</button><button data-r="never">never ask</button>
      </div>`;
    card.querySelectorAll('[data-r]').forEach(btn => btn.onclick = () => {
      const r = btn.dataset.r, ta = $('merge-text');
      if (r === 'merged' && ta.hidden) { ta.hidden = false; ta.value = `${a.text} / ${b.text}`; ta.focus(); btn.textContent = 'merge it'; return; }
      onResolve(arg.id, r);
    });
    card.hidden = false;
  } else if (sug) {
    const more = store.links.filter(l => l.status === 'suggested').length - 1;
    card.innerHTML = `<p class="why">suggested link: ${esc(sug.reason)}${more > 0 ? ` · ${more} more waiting` : ''}</p>
      <div class="pair"><div class="side"><b>${esc(title(sug.from))}</b></div><div class="side"><b>${esc(title(sug.to))}</b></div></div>
      <div class="row"><button data-x="no">no</button><button data-x="yes" class="yes">link them</button></div>`;
    card.querySelector('[data-x=yes]').onclick = () => onConfirm(sug.id);
    card.querySelector('[data-x=no]').onclick = () => onReject(sug.id);
    card.hidden = false;
  } else { card.hidden = true; card.innerHTML = ''; }
}

function renderList() {
  const q = $('filter').value.trim().toLowerCase();
  const list = store.notes.filter(n => !q || `${n.title} ${n.text} ${(n.tags || []).join(' ')} ${n.topic || ''}`.toLowerCase().includes(q))
    .sort((a, b) => Date.parse(b.lastTouchedAt) - Date.parse(a.lastTouchedAt));
  $('count').textContent = `${list.length}${q ? ` of ${store.notes.length}` : ''}`;
  $('notes').innerHTML = list.map(n => {
    const v = Math.max(0.15, n.replacedBy ? Math.min(n.vitality ?? 1, 0.15) : n.vitality ?? 1);
    const op = (0.3 + 0.7 * v).toFixed(2); // faded notes render dimmer; nothing is removed
    return `<li data-id="${esc(n.id)}" class="${n.replacedBy ? 'ghost' : ''} ${n.source === 'voice' ? 'voice' : ''} ${n.id === openId ? 'on' : ''}" style="opacity:${op}">
      <span class="t">${esc(n.title)}</span><span class="m">${esc(n.topic || (n.tags || []).filter(t => t !== 'city').slice(0, 2).join(', ') || n.source)} · ${esc(ago(n.lastTouchedAt))}${n.replacedBy ? ' · faded' : ''}</span></li>`;
  }).join('');
}

function renderDetail() {
  const d = $('detail'), n = store.notes.find(x => x.id === openId);
  if (!n) { d.hidden = true; return; }
  const ls = store.links.filter(l => (l.from === n.id || l.to === n.id) && l.status !== 'rejected');
  d.innerHTML = `<button class="close" aria-label="close">×</button><h2>${esc(n.title)}</h2><p>${esc(n.text)}</p>
    <div>${n.topic ? `<span class="chip">${esc(n.topic)}</span>` : ''}${(n.tags || []).map(t => `<span class="chip">#${esc(t)}</span>`).join('')}</div>
    <div class="meta">${esc(n.source)} · ${esc(n.origin || '')} · vitality ${(n.replacedBy ? Math.min(+n.vitality || 0, 0.15) : +n.vitality || 0).toFixed(2)}${n.replacedBy ? ` · replaced by ${esc(title(n.replacedBy))}` : ''}</div>
    ${ls.length ? `<ul>${ls.map(l => { const o = l.from === n.id ? l.to : l.from; return `<li class="${l.status}"><a href="#" data-open="${esc(o)}">${esc(title(o))}</a> · ${esc(l.reason)}${l.status === 'suggested' ? ' (waiting for a yes)' : ''}</li>`; }).join('')}</ul>` : ''}`;
  d.hidden = false;
  d.querySelector('.close').onclick = () => { openId = null; render(); };
  d.querySelectorAll('[data-open]').forEach(a => a.onclick = e => { e.preventDefault(); openNote(a.dataset.open); });
}

function hint(s) { $('hint').textContent = s; }

// ---------- input: text ----------
$('entry').addEventListener('submit', e => { e.preventDefault(); const t = $('text').value; $('text').value = ''; addNote(t, 'text'); });
$('notes').addEventListener('click', e => { const li = e.target.closest('li[data-id]'); if (li) openNote(li.dataset.id); });
$('filter').addEventListener('input', renderList);
$('toggle-panel').onclick = () => { const closed = document.body.classList.toggle('panel-closed'); $('toggle-panel').setAttribute('aria-expanded', String(!closed)); syncInset(); };
$('reset').onclick = () => {
  if (!confirm('start over? this clears your notes in this browser and reloads the seed.')) return;
  localStorage.removeItem(STORAGE_KEY); store = fromSeed(); openId = null; said = { key: '' };
  firstRun();
};
$('export').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' }));
  a.download = `living-brain-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

// ---------- input: voice (Web Speech API) ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const mic = $('mic');
if (!SR) {
  mic.disabled = true; mic.title = "voice isn't supported in this browser. typing works the same.";
  hint("voice needs chrome, edge or safari. typing works the same.");
} else {
  let rec = null, finalText = '';
  mic.onclick = () => {
    if (rec) { rec.stop(); return; }
    rec = new SR(); finalText = '';
    rec.lang = navigator.language || 'en-US'; rec.interimResults = true; rec.continuous = false;
    rec.onstart = () => { mic.setAttribute('aria-pressed', 'true'); hint('listening…'); };
    rec.onresult = e => {
      let interim = ''; finalText = '';
      for (const r of e.results) (r.isFinal ? (finalText += r[0].transcript) : (interim += r[0].transcript));
      $('text').value = (finalText + interim).trim();
    };
    rec.onerror = e => hint(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'the mic is blocked for this page. typing works the same.' : e.error === 'no-speech' ? "didn't catch anything." : `voice error: ${e.error}`);
    rec.onend = () => {
      mic.setAttribute('aria-pressed', 'false'); rec = null;
      const t = finalText.trim();
      if (t) { $('text').value = ''; hint(''); addNote(t, 'voice'); } else if ($('hint').textContent === 'listening…') hint('');
    };
    try { rec.start(); } catch (err) { rec = null; hint('voice could not start. typing works the same.'); }
  };
}

// ---------- boot ----------
if (location.protocol === 'file:') hint('serve the repo over http (python3 -m http.server) so the modules load.');
if (window.innerWidth < 1000) { document.body.classList.add('panel-closed'); $('toggle-panel').setAttribute('aria-expanded', 'false'); }
syncInset();
const [seed, lines] = await Promise.all([
  fetch('../seed/waystone-first-meal.json').then(r => r.json()),
  fetch('../voice/waystone-lines.json').then(r => r.json()).catch(() => null),
]);
SEED = seed; LINES = lines;
const saved = loadSaved();
store = saved || fromSeed();
if (saved) refresh(); else firstRun();
setInterval(() => refresh(), 30_000);

// handle for demos, tests, and a real model judge later:
// livingBrain.setJudge(async (older, newer) => ({ verdict: 'contradicts' | 'fine', summary })) — prompt: JUDGE_PROMPT in src/brain.js
window.livingBrain = {
  _creature: creature,
  get store() { return store; }, get says() { return said.text; },
  addNote, confirm: onConfirm, reject: onReject, resolve: onResolve, open: openNote, refresh,
  setJudge(fn) { judge = fn || localJudge; },
};
