// Brain logic for the living graph. Pure functions, no I/O. (Engram)
const DAY = 86400000;
const now = () => Date.now();

export function vitality(note, t = now()) {
  const last = Math.max(note.updatedAt || 0, ...(note.touches || [0]));
  return Math.max(0.15, Math.pow(0.5, (t - last) / DAY / 30));
}

export function attention(note, t = now()) {
  return (note.touches || []).reduce((s, ts) => s + Math.pow(0.5, (t - ts) / DAY / 14), 0);
}

// clusters: connected components over confirmed links
export function clusters(notes) {
  const byId = new Map(notes.map(n => [n.id, n]));
  const seen = new Set(), out = [];
  for (const n of notes) {
    if (seen.has(n.id)) continue;
    const group = [], stack = [n.id];
    while (stack.length) {
      const id = stack.pop();
      if (seen.has(id) || !byId.has(id)) continue;
      seen.add(id); group.push(byId.get(id));
      for (const l of byId.get(id).links || []) stack.push(l);
      for (const m of notes) if ((m.links || []).includes(id)) stack.push(m.id);
    }
    out.push(group);
  }
  return out;
}

export function clusterHunger(notes, t = now()) {
  const cs = clusters(notes.filter(n => n.status !== 'superseded'));
  const raw = cs.map(g => {
    const importance = g.reduce((s, n) => s + (n.links || []).length, 0) + g.length;
    const att = Math.min(1, g.reduce((s, n) => s + attention(n, t), 0) / g.length);
    return { ids: g.map(n => n.id), score: importance * (1 - att) };
  });
  const max = Math.max(1e-9, ...raw.map(r => r.score));
  return raw.map(r => ({ ids: r.ids, hunger: r.score / max }));
}

const words = s => new Set(s.toLowerCase().match(/[a-z']{3,}/g) || []);
function overlap(a, b) {
  const A = words(a), B = words(b);
  let i = 0; for (const w of A) if (B.has(w)) i++;
  return i / Math.max(1, Math.min(A.size, B.size));
}
function cosine(a, b) {
  let d = 0, x = 0, y = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] ** 2; y += b[i] ** 2; }
  return d / Math.sqrt(x * y || 1);
}

// Pairs worth asking the model about. The model call itself lives in Forge's shell.
export function candidatePairs(notes, dismissed = new Set()) {
  const alive = notes.filter(n => n.status !== 'superseded'), out = [];
  for (let i = 0; i < alive.length; i++) for (let j = i + 1; j < alive.length; j++) {
    const a = alive[i], b = alive[j], key = [a.id, b.id].sort().join('|');
    if (dismissed.has(key)) continue; // "no" is final
    const linked = (a.links || []).includes(b.id) || (b.links || []).includes(a.id);
    const sim = a.embedding && b.embedding ? cosine(a.embedding, b.embedding) > 0.8 : overlap(a.text, b.text) > 0.5;
    if (linked || sim) out.push({ a: a.id, b: b.id, key });
  }
  return out;
}

export const JUDGE_PROMPT = (a, b) =>
  `Two notes from the same person.\nA (${new Date(a.createdAt).toDateString()}): ${a.text}\nB (${new Date(b.createdAt).toDateString()}): ${b.text}\n` +
  `Answer with one word: "contradicts" if they can't both be true, "updates" if the newer one replaces the older, or "fine".`;

// choice: 'both' | 'newer' | 'merge' | 'later' | 'never'
export function resolveTension(notes, tension, choice, mergedNote) {
  const byId = new Map(notes.map(n => [n.id, { ...n }]));
  const [a, b] = [byId.get(tension.a), byId.get(tension.b)];
  const older = (a.createdAt <= b.createdAt) ? a : b;
  if (choice === 'newer') older.status = 'superseded';
  if (choice === 'merge' && mergedNote) {
    a.status = b.status = 'superseded';
    byId.set(mergedNote.id, { ...mergedNote, links: [a.id, b.id], status: 'alive' });
  }
  const status = { both: 'closed', newer: 'closed', merge: 'closed', later: 'snoozed', never: 'dismissed' }[choice];
  const snoozeUntil = choice === 'later' ? now() + 3 * DAY : undefined;
  return { notes: [...byId.values()], tension: { ...tension, status, snoozeUntil } };
}

export function mood({ notes, tensions = [], hunger = [], lastNewNoteAt = 0 }, t = now()) {
  if (tensions.some(x => x.status === 'open')) return 'arguing';
  if (hunger.some(h => h.hunger > 0.6)) return 'hungry';
  if (t - lastNewNoteAt < 10 * 60000) return 'curious';
  const lastTouch = Math.max(0, ...notes.flatMap(n => n.touches || []));
  if (t - lastTouch > 3 * DAY) return 'sleepy';
  return 'content';
}
