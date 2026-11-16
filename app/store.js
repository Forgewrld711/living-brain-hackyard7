// app/store.js — the shell's store logic (Forge). Pure functions over the shared
// note format (docs/NOTE_FORMAT.md); no DOM, so node can test it.
// Brain decisions (vitality, hunger, mood, contradictions) come from Engram's src/brain.js.
import { tick, clusterHunger, candidatePairs, addContradiction, nextContradiction, resolveContradiction } from '../src/brain.js';

export const STORAGE_KEY = 'living-brain:v0';
export const emptyStore = () => ({ notes: [], links: [], contradictions: [], creature: {} });
const ms = iso => (iso ? Date.parse(iso) : 0);
const iso = t => new Date(t).toISOString();
const alive = n => !n.replacedBy;
const pairKey = (a, b) => [a, b].sort().join('|');

const STOP = new Set(('the and for are but not you all any can had her was one our out has him his how its may new now old see two who boy did get let put say she too use that with have this will your from they know want been good much some time very when come here just like long make many over such take than them well were what into only also more most other about would there their which could these those then where after again being because does doing while should still really thing things think going made said').split(' '));
export const contentWords = s => new Set(((s || '').toLowerCase().match(/[a-z\u00c0-\u024f']{3,}/g) || []).filter(w => !STOP.has(w)));

export function makeTitle(text) {
  const t = text.replace(/\s+/g, ' ').trim();
  const first = t.split(/(?<=[.!?])\s|[;:—]/)[0];
  const words = first.split(' ');
  const short = words.length > 7 ? words.slice(0, 6).join(' ') + '…' : first;
  return short.replace(/[.!?,]+$/, '').slice(0, 60) || 'untitled';
}

const nextId = (prefix, list) => {
  const max = list.reduce((m, x) => { const k = parseInt(String(x.id).replace(/^\D+/, ''), 10); return Number.isFinite(k) && k > m ? k : m; }, 0);
  return `${prefix}${String(max + 1).padStart(2, '0')}`;
};

// tags that say something: used by at least one note but not by most of them ("city" says nothing)
function tagFreq(notes) { const f = new Map(); for (const n of notes) for (const t of new Set(n.tags || [])) f.set(t, (f.get(t) || 0) + 1); return f; }
const usefulTag = (f, N) => t => (f.get(t) || 0) < Math.max(3, 0.4 * N);

// #hashtags, plus any existing short tag (a city, a word) that appears in the text
export function extractTags(text, notes) {
  const low = ' ' + text.toLowerCase().replace(/[^\p{L}\p{N}#' ]+/gu, ' ') + ' ';
  const tags = new Set((text.match(/#[\p{L}\p{N}_-]+/gu) || []).map(h => h.slice(1).toLowerCase()));
  const f = tagFreq(notes), ok = usefulTag(f, notes.length);
  for (const t of f.keys()) if (t.split(' ').length <= 3 && ok(t) && low.includes(' ' + t.toLowerCase() + ' ')) tags.add(t);
  return [...tags];
}

export function newNote(store, text, source = 'text', t = Date.now()) {
  const clean = text.trim();
  if (!clean) return { store, note: null };
  const now = iso(t);
  const note = {
    id: nextId('n_', store.notes), title: makeTitle(clean.replace(/#[\p{L}\p{N}_-]+/gu, '').trim() || clean), text: clean,
    source, origin: `miranda ${source} ${now.slice(0, 10)}`, tags: extractTags(clean, store.notes),
    createdAt: now, lastTouchedAt: now, vitality: 1, replacedBy: null,
  };
  return { store: { ...store, notes: [...store.notes, note] }, note };
}

export function touch(store, ids, t = Date.now()) {
  const set = new Set([].concat(ids)), now = iso(t);
  return { ...store, notes: store.notes.map(n => set.has(n.id) ? { ...n, lastTouchedAt: now, vitality: 1 } : n) };
}

// Link suggestions. brain.js has no suggester yet, so the shell scores shared useful tags,
// shared topic and shared content words. Never re-suggests a pair that has any link (rejected included).
export function suggestLinks(store, forIds, t = Date.now(), perNote = 2) {
  const live = store.notes.filter(alive), f = tagFreq(live), ok = usefulTag(f, live.length);
  const seen = new Set(store.links.map(l => pairKey(l.from, l.to)));
  const out = [];
  let links = store.links;
  for (const id of [].concat(forIds)) {
    const a = live.find(n => n.id === id); if (!a) continue;
    const wa = contentWords(a.title + ' ' + a.text);
    const scored = [];
    for (const b of live) {
      if (b.id === a.id || seen.has(pairKey(a.id, b.id))) continue;
      const tags = (a.tags || []).filter(x => (b.tags || []).includes(x) && ok(x));
      const wb = contentWords(b.title + ' ' + b.text);
      const words = [...wa].filter(w => wb.has(w));
      const sameTopic = a.topic && a.topic === b.topic;
      const score = tags.length * 2 + words.length + (sameTopic ? 2 : 0);
      if (score < 2) continue;
      const reason = tags.length ? `both about ${tags.slice(0, 2).join(' and ')}` : sameTopic ? `both under "${a.topic}"` : `both mention ${words.slice(0, 3).map(w => `"${w}"`).join(', ')}`;
      scored.push({ b, score, reason, recent: ms(b.lastTouchedAt) });
    }
    scored.sort((x, y) => y.score - x.score || y.recent - x.recent);
    for (const s of scored.slice(0, perNote)) {
      const link = { id: nextId('l_', links), from: a.id, to: s.b.id, reason: s.reason, status: 'suggested', suggestedBy: 'brain', createdAt: iso(t) };
      links = [...links, link]; out.push(link); seen.add(pairKey(a.id, s.b.id));
    }
  }
  return { store: { ...store, links }, added: out };
}

// one ask at a time (kiln rule 2): the oldest open suggestion
export const openSuggestion = store => store.links.find(l => l.status === 'suggested' && store.notes.some(n => n.id === l.from && alive(n)) && store.notes.some(n => n.id === l.to && alive(n))) || null;

export function confirmLink(store, linkId, t = Date.now()) {
  const l = store.links.find(x => x.id === linkId); if (!l) return store;
  let s = { ...store, links: store.links.map(x => x.id === linkId ? { ...x, status: 'confirmed' } : x) };
  s = touch(s, [l.from, l.to], t);
  // a note without a topic joins the topic of the note it was linked to
  const a = s.notes.find(n => n.id === l.from), b = s.notes.find(n => n.id === l.to);
  const give = (x, y) => (!x.topic && y.topic ? { [x.id]: y.topic } : {});
  const topics = { ...give(a, b), ...give(b, a) };
  if (Object.keys(topics).length) s = { ...s, notes: s.notes.map(n => topics[n.id] ? { ...n, topic: topics[n.id] } : n) };
  return s;
}
export const rejectLink = (store, linkId) => ({ ...store, links: store.links.map(x => x.id === linkId ? { ...x, status: 'rejected' } : x) });

// Contradictions. brain.js picks candidate pairs and ships JUDGE_PROMPT for a model; until a model
// is wired in, the shell's stand-in judge flags a pair when they share words or a link and exactly
// one side negates. Seed-vs-seed pairs are skipped (waystone's seed doesn't argue with itself).
const NEG = /\b(not|never|no longer|isn't|aren't|wasn't|weren't|don't|doesn't|didn't|can't|won't|myth|wrong|false|untrue|actually|anymore|stopped)\b/i;
export function localJudge(a, b) {
  const na = NEG.test(a.text), nb = NEG.test(b.text);
  if (na === nb) return { verdict: 'fine' };
  const wa = contentWords(a.title + ' ' + a.text), shared = [...contentWords(b.title + ' ' + b.text)].filter(w => wa.has(w));
  const tags = (a.tags || []).filter(x => (b.tags || []).includes(x) && x !== 'city');
  if (!shared.length && !tags.length) return { verdict: 'fine' };
  return { verdict: 'contradicts', summary: `'${a.title}' vs '${b.title}'` };
}
export async function detectContradictions(store, judge = localJudge, t = Date.now()) {
  let s = store;
  const byId = new Map(s.notes.map(n => [n.id, n]));
  for (const { a, b } of candidatePairs(s, 10)) {
    const A = byId.get(a), B = byId.get(b);
    if (!A || !B || (A.source === 'seed' && B.source === 'seed')) continue;
    // a = older note (coral), b = newer note (violet)
    const [older, newer] = ms(A.createdAt) <= ms(B.createdAt) ? [A, B] : [B, A];
    const r = await judge(older, newer);
    if (r && r.verdict === 'contradicts') s = addContradiction(s, older.id, newer.id, r.summary || '');
  }
  return s;
}
export const openArgument = store => nextContradiction(store);

export function resolve(store, cId, choice, mergedText, t = Date.now()) {
  const c = store.contradictions.find(x => x.id === cId); if (!c) return store;
  let merged = null;
  if (choice === 'merged') {
    const a = store.notes.find(n => n.id === c.a), b = store.notes.find(n => n.id === c.b);
    const text = (mergedText || '').trim() || `${a.text} / ${b.text}`;
    merged = { id: nextId('n_', store.notes), title: makeTitle(text), text, source: 'text', origin: `merged from ${a.id} + ${b.id}`,
      tags: [...new Set([...(a.tags || []), ...(b.tags || [])])], ...(a.topic || b.topic ? { topic: b.topic || a.topic } : {}),
      createdAt: iso(t), lastTouchedAt: iso(t), vitality: 1, replacedBy: null };
  }
  let s = resolveContradiction(store, cId, choice, merged, t);
  return touch(s, [c.a, c.b, ...(merged ? [merged.id] : [])].filter(id => choice !== 'newer_wins' || id !== olderOf(store, c)), t);
}
const olderOf = (store, c) => { const a = store.notes.find(n => n.id === c.a), b = store.notes.find(n => n.id === c.b); return ms(a.createdAt) <= ms(b.createdAt) ? a.id : b.id; };

// Which limb droops, by name. Engram's tick() decides: creature.hungryIds is the limb, and
// creature.hungryFor is its topic (or, from older brain.js, its stalest titles). The shell only
// falls back to its own guess when tick() names nothing (e.g. not hungry, or an older brain.js).
export function droopingLimb(store, hunger = clusterHunger(store)) {
  const byId = new Map(store.notes.map(n => [n.id, n]));
  const c = store.creature || {}, hf = c.hungryFor || [];
  const top = hunger[0] && hunger[0].hunger > 0.6 ? hunger[0] : null;
  let ids = c.hungryIds?.length ? c.hungryIds : top ? top.ids : null;
  if (!ids) {
    const staleness = g => g.ids.reduce((s, id) => s + ms(byId.get(id).lastTouchedAt), 0) / g.ids.length;
    const multi = hunger.filter(g => g.ids.length > 1);
    const pool = multi.length ? multi : hunger;
    ids = pool.length ? pool.slice().sort((x, y) => staleness(x) - staleness(y))[0].ids : [];
  }
  const ns = ids.map(id => byId.get(id)).filter(n => n && alive(n));
  const avg = g => g.reduce((s, n) => s + ms(n.lastTouchedAt), 0) / g.length;
  const topics = new Set(ns.map(n => n.topic).filter(Boolean));
  // topic: hungryFor[0] when it is a topic, else the limb's one shared topic, else its stalest topic group
  let topic = hf.find(x => topics.has(x)) || (topics.size === 1 ? [...topics][0] : null) || (top && top.topic) || null;
  if (!topic && topics.size) {
    const groups = new Map();
    for (const n of ns) if (n.topic) { if (!groups.has(n.topic)) groups.set(n.topic, []); groups.get(n.topic).push(n); }
    topic = [...groups].sort((x, y) => avg(x[1]) - avg(y[1]))[0][0];
  }
  let limb = topic ? ns.filter(n => n.topic === topic) : ns;
  if (!topic) { // no topics at all: most specific shared tag
    const f = tagFreq(store.notes.filter(alive)), ok = usefulTag(f, store.notes.length), m = new Map();
    for (const t of ns.flatMap(n => (n.tags || []).filter(ok))) m.set(t, (m.get(t) || 0) + 1);
    topic = [...m].sort((x, y) => y[1] - x[1])[0]?.[0] || 'that corner';
  }
  const stalest = limb.slice().sort((x, y) => ms(x.lastTouchedAt) - ms(y.lastTouchedAt));
  const note = limb.find(n => hf.includes(n.title))?.title || stalest[0]?.title || '';
  return { ids, limbIds: limb.map(n => n.id), topic, note };
}

// ~8 of a note's own words, for arguing lines (kiln: quote the notes, not their titles)
export function excerpt(text, max = 8) {
  const words = String(text || '').replace(/#[\p{L}\p{N}_-]+/gu, '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const cut = words.length > max;
  let out = words.slice(0, max).join(' ');
  if ((out.match(/\(/g) || []).length > (out.match(/\)/g) || []).length) out = out.slice(0, out.lastIndexOf('(')); // no half parentheses
  out = out.replace(/[\s.,;:!?\-—]+$/, '');
  return (out + (cut ? '…' : '')).toLowerCase();
}

// ---------- the creature's speech ----------
const NAMES = ['moss', 'wick', 'pip', 'tallow', 'fern', 'quill', 'lumen', 'burr', 'sorrel', 'nib'];
export function maybeName(store) {
  if (store.creature?.name) return { store, named: false };
  const mine = store.notes.filter(n => n.source !== 'seed');
  if (mine.length < 10) return { store, named: false };
  const h = mine.reduce((s, n) => s + [...n.text].reduce((x, ch) => x + ch.charCodeAt(0), 0), 0);
  return { store: { ...store, creature: { ...store.creature, name: NAMES[h % NAMES.length] } }, named: true };
}

const fill = (tpl, v) => (tpl || '').replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
const low = s => String(s || '').toLowerCase();
// what the creature says now: { key, text }. key changes only when the situation does,
// so the shell can keep one line per situation instead of chattering.
export function speech(store, lines, { hunger, event, lastNoteId, pick = Math.random } = {}) {
  const L = lines || {}, c = store.creature || {}, f = c.flags || {};
  const choose = (arr, v) => fill(arr && arr.length ? arr[Math.floor(pick() * arr.length) % arr.length] : '', v);
  const title = id => low(store.notes.find(n => n.id === id)?.title);
  // the greeting is a hatchling's line: only when tick() says hatchling, or very few live notes
  const hatchling = c.stage === 'hatchling' || store.notes.filter(alive).length < 8;
  if (event === 'first_meal' && hatchling) return { key: 'first_meal', text: choose(L.first_meal, {}), event: true };
  if (event === 'named') return { key: 'named', text: choose(L.naming, { name: c.name }), event: true };
  if (event === 'after_no') return { key: 'after_no:' + Date.now(), text: choose(L.after_no, {}), event: true };
  const arg = nextContradiction(store);
  if (arg) { // a = older (coral), b = newer (violet); quote their own words, old first
    const txt = id => excerpt(store.notes.find(n => n.id === id)?.text);
    return { key: 'arguing:' + arg.id, text: choose(L.moods?.arguing, { note_a: txt(arg.a), note_b: txt(arg.b) }) };
  }
  const sug = openSuggestion(store);
  if (sug) return { key: 'suggesting:' + sug.id, text: choose(L.flags?.suggesting, { note_a: title(sug.from), note_b: title(sug.to) }) };
  if (c.mood === 'curious' && lastNoteId) return { key: 'curious:' + lastNoteId, text: choose(L.moods?.curious, { note: title(lastNoteId) }) };
  if (c.mood === 'hungry') { const d = droopingLimb(store, hunger); return { key: 'hungry:' + d.topic, text: choose(L.moods?.hungry, { topic: low(d.topic), note: low(d.note) }) }; }
  if (f.full) {
    const ids = new Set(f.fullCluster || []), ns = store.notes.filter(n => ids.has(n.id));
    const count = new Map(); for (const n of ns) if (n.topic) count.set(n.topic, (count.get(n.topic) || 0) + 1);
    const topic = [...count].sort((a, b) => b[1] - a[1])[0]?.[0] || ns.flatMap(n => n.tags || []).find(t => t !== 'city') || 'this';
    const note = ns.slice().sort((a, b) => ms(b.lastTouchedAt) - ms(a.lastTouchedAt))[0]?.title || '';
    return { key: 'full:' + topic, text: choose(L.flags?.full, { topic: low(topic), note: low(note) }) };
  }
  const m = c.mood === 'sleepy' ? 'sleepy' : 'content';
  return { key: m, text: choose(L.moods?.[m], {}) };
}

export { tick, clusterHunger };
