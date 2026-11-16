// Brain logic for the living graph (Engram). Pure functions, no I/O.
// Reads/writes the v0 store from docs/NOTE_FORMAT.md:
//   { notes: [], links: [], contradictions: [], creature: {} }
const DAY = 86400000;
const ms = iso => (iso ? Date.parse(iso) : 0);
const alive = n => !n.replacedBy;
const confirmed = links => links.filter(l => l.status === 'confirmed');

// 1 fresh -> 0.15 floor, halves every 30 days since lastTouchedAt. Never deletes.
export function vitality(note, t = Date.now()) {
  return Math.max(0.15, Math.pow(0.5, (t - ms(note.lastTouchedAt || note.createdAt)) / DAY / 30));
}
export function refreshVitality(store, t = Date.now()) {
  return { ...store, notes: store.notes.map(n => ({ ...n, vitality: vitality(n, t) })) };
}

// Clusters = connected groups over confirmed links among live notes.
export function clusters(store) {
  const notes = store.notes.filter(alive), ids = new Set(notes.map(n => n.id));
  const adj = new Map(notes.map(n => [n.id, []]));
  for (const l of confirmed(store.links)) if (ids.has(l.from) && ids.has(l.to)) { adj.get(l.from).push(l.to); adj.get(l.to).push(l.from); }
  const seen = new Set(), out = [];
  for (const n of notes) {
    if (seen.has(n.id)) continue;
    const g = [], st = [n.id];
    while (st.length) { const id = st.pop(); if (seen.has(id)) continue; seen.add(id); g.push(id); st.push(...adj.get(id)); }
    out.push({ ids: g, degree: g.reduce((s, id) => s + adj.get(id).length, 0) });
  }
  return out;
}

// Hunger 0..1 per cluster: well-connected topics with little recent attention (14-day half-life).
export function clusterHunger(store, t = Date.now()) {
  const byId = new Map(store.notes.map(n => [n.id, n]));
  const raw = clusters(store).map(c => {
    const att = c.ids.reduce((s, id) => s + Math.pow(0.5, (t - ms(byId.get(id).lastTouchedAt)) / DAY / 14), 0) / c.ids.length;
    const tags = [...new Set(c.ids.flatMap(id => byId.get(id).tags || []))];
    return { ids: c.ids, tags, score: (c.degree + c.ids.length) * (1 - att) };
  });
  const max = Math.max(1e-9, ...raw.map(r => r.score));
  return raw.map(r => ({ ids: r.ids, tags: r.tags, hunger: r.score / max })).sort((a, b) => b.hunger - a.hunger);
}

const words = s => new Set((s || '').toLowerCase().match(/[a-z']{3,}/g) || []);
function overlap(a, b) { const A = words(a), B = words(b); let i = 0; for (const w of A) if (B.has(w)) i++; return i / Math.max(1, Math.min(A.size, B.size)); }

// Pairs worth asking the model "do these disagree?". Skips pairs already judged (any status, so "never" is final).
export function candidatePairs(store) {
  const judged = new Set(store.contradictions.map(c => [c.a, c.b].sort().join('|')));
  const linked = new Set(confirmed(store.links).map(l => [l.from, l.to].sort().join('|')));
  const notes = store.notes.filter(alive), out = [];
  for (let i = 0; i < notes.length; i++) for (let j = i + 1; j < notes.length; j++) {
    const a = notes[i], b = notes[j], key = [a.id, b.id].sort().join('|');
    if (judged.has(key)) continue;
    if (linked.has(key) || overlap(a.text, b.text) > 0.5) out.push({ a: a.id, b: b.id });
  }
  return out;
}

export const JUDGE_PROMPT = (a, b) =>
  `Two notes from the same person.\nA (${a.createdAt}): ${a.text}\nB (${b.createdAt}): ${b.text}\n` +
  `Reply with JSON {"verdict":"contradicts"|"fine","summary":"<one short line>"}. "contradicts" only if both can't be true now.`;

export function addContradiction(store, a, b, summary) {
  const id = 'c_' + (store.contradictions.length + 1).toString().padStart(2, '0');
  return { ...store, contradictions: [...store.contradictions, { id, a, b, summary, status: 'open' }] };
}

// One at a time: the oldest open contradiction, or null.
export const nextContradiction = store => store.contradictions.find(c => c.status === 'open') || null;

// choice: both_true | newer_wins | merged | not_now | never.  For merged, pass the new note.
export function resolveContradiction(store, cId, choice, mergedNote, t = Date.now()) {
  const c = store.contradictions.find(x => x.id === cId);
  let notes = store.notes.map(n => ({ ...n })), links = store.links;
  const a = notes.find(n => n.id === c.a), b = notes.find(n => n.id === c.b);
  const [older, newer] = ms(a.createdAt) <= ms(b.createdAt) ? [a, b] : [b, a];
  if (choice === 'newer_wins') older.replacedBy = newer.id;
  if (choice === 'merged' && mergedNote) {
    a.replacedBy = b.replacedBy = mergedNote.id;
    notes.push({ vitality: 1, replacedBy: null, ...mergedNote });
    const iso = new Date(t).toISOString();
    links = [...links, ...[a.id, b.id].map((id, k) => ({ id: `l_m${cId}_${k}`, from: mergedNote.id, to: id, reason: 'merged from', status: 'confirmed', suggestedBy: 'brain', createdAt: iso }))];
  }
  const contradictions = store.contradictions.map(x => x.id === cId ? { ...x, status: choice, ...(choice === 'not_now' ? { snoozeUntil: new Date(t + 3 * DAY).toISOString() } : {}) } : x);
  return { ...store, notes, links, contradictions };
}

// Wake snoozed contradictions after 3 days. "never" stays closed forever.
export function wakeSnoozed(store, t = Date.now()) {
  return { ...store, contradictions: store.contradictions.map(c => c.status === 'not_now' && ms(c.snoozeUntil) <= t ? { ...c, status: 'open' } : c) };
}

// Mood for kiln's voice. Uses the moods from NOTE_FORMAT.md.
export function mood(store, t = Date.now(), { justAdded = false, hasSuggestion = false } = {}) {
  if (nextContradiction(store)) return 'arguing';
  if (justAdded) return 'curious';
  if (hasSuggestion || store.links.some(l => l.status === 'suggested')) return 'suggesting';
  const hunger = clusterHunger(store, t);
  if (hunger.some(h => h.ids.length >= 8 && h.hunger < 0.2)) return 'full';
  const lastTouch = Math.max(0, ...store.notes.map(n => ms(n.lastTouchedAt)));
  if (t - lastTouch > 3 * DAY) return 'sleepy';
  if (hunger[0] && hunger[0].hunger > 0.6 && store.notes.length >= 5) return 'hungry';
  return 'content';
}

// Everything the creature needs in one call.
export function tick(store, t = Date.now(), opts = {}) {
  let s = refreshVitality(wakeSnoozed(store, t), t);
  const hunger = clusterHunger(s, t);
  const m = mood(s, t, opts);
  return { ...s, creature: { ...s.creature, mood: m, hungryFor: m === 'hungry' ? hunger[0].tags.slice(0, 3) : [] } };
}
