// viz/creature.js — the moving graph (Twelve).
// A dependency-free canvas creature for living brain. Notes become glowing nodes,
// topics become limbs, dense topics grow buds. It breathes, sags when hungry,
// twitches on contradictions, and fades notes without ever removing them.
// Art direction: art/README.md (waystone). Data: docs/NOTE_FORMAT.md. Brain: src/brain.js (Engram).

const PAL = {
  night: '#0B0C12', lifted: '#1A1E2A', moon: '#C9D0DC',
  core: '#F4E6C1', mid: '#E8C97A', halo: '#A8C5D4',
  thread: '#C9D4E8', threadDim: '#8FA3C4', membrane: '#2A3348',
  ash1: '#6B7280', ash2: '#3D4658', ash3: '#2E3440',
  warmA: '#E8A87C', warmB: '#E07A4A', coolA: '#7B9CFF', coolB: '#8B6BFF',
};
const hex = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const C = Object.fromEntries(Object.entries(PAL).map(([k, v]) => [k, hex(v)]));
const WHITE = [255, 250, 240];
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${clamp(a, 0, 1).toFixed(3)})`;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// exponential approach: no overshoot, no bounce
const approach = (cur, target, dt, tau) => cur + (target - cur) * (1 - Math.exp(-dt / Math.max(tau, 1e-3)));
const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const noise = x => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash(i) * (1 - u) + hash(i + 1) * u; };
const strSeed = s => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return ((h >>> 0) % 100000) / 10; };
const DEG = Math.PI / 180;
const angDiff = (to, from) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const rot = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

// Limb directions in degrees (canvas: 0 = right, 90 = straight down). First three are
// the hatchling's legs, then arms, then the in-between slots.
const LIMB_SLOTS = [112, 90, 68, 200, -20, 148, 32, 226, -46, 170, 10, 244, -64, 188, -8];
const HEAD_RING = [[158, 5.2], [186, 5.8], [214, 5], [246, 5.6], [276, 6], [318, 4.6], [12, 4.4]];
const TORSO_FIXED = [232, 308, 168, 12];

export function createCreature(canvas, options = {}) {
  const ctx = canvas.getContext('2d');
  const topicOfOpt = options.topicOf || null; // (note) => topic string; default is note.topic via groupTopics()
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  let reducedOverride = options.reducedMotion; // undefined = follow the OS setting
  const reduced = () => reducedOverride ?? !!(mq && mq.matches);

  let notes = [], links = [], byId = new Map(), limbs = [];
  let brain = { mood: 'content' };
  const slotOf = new Map();   // topic -> limb slot, stable for the life of the creature
  const anim = new Map();     // note id -> animated state
  const limbAnim = new Map(); // topic -> { sag }
  const tensions = new Map(); // pair key -> { a, b, t0, amt, open }
  const handlers = { click: new Set(), hover: new Set() };
  if (options.onNodeClick) handlers.click.add(options.onNodeClick);
  if (options.onNodeHover) handlers.hover.add(options.onNodeHover);

  let W = 0, H = 0, dpr = 1, U = 1, bg = null;
  let g = 0.5, full = 0, suggest = 0, tilt = 0, leanX = 0, leanY = 0, tense = 0, sleep = 0, curious = 0;
  let phase = 0, time = 0, last = performance.now(), raf = 0, hovered = null;
  let frame = { notes: [], deco: [], head: null, torso: null, eyes: [], br: 0 };

  // inset: the creature is laid out in the canvas minus this margin (CSS px), so it can
  // sit in the open area beside the shell's 320px side panel and above the dock.
  const normInset = v => {
    const o = v && typeof v === 'object' ? v : {};
    return {
      left: Math.max(0, +o.left || 0), right: Math.max(0, +o.right || 0),
      top: Math.max(0, +o.top || 0), bottom: Math.max(0, +o.bottom || 0),
    };
  };
  let inset = normInset(options.inset);
  const visible = () => {
    const l = inset.left, t = inset.top;
    const w = Math.max(1, W - l - inset.right), h = Math.max(1, H - t - inset.bottom);
    return { l, t, w, h, cx: l + w * 0.5, cy: t + h * 0.56 };
  };
  const applySize = () => { const v = visible(); U = Math.min(v.w, v.h) / 1000; };

  // ---------- inputs ----------
  function setNotes(notesIn = [], linksIn = []) {
    notes = notesIn.slice(); links = linksIn.slice();
    byId = new Map(notes.map(n => [n.id, n]));
    const topicMap = topicOfOpt ? new Map(notes.map(n => [n.id, topicOfOpt(n)])) : groupTopics(notes, links);
    const sorted = notes.slice().sort((a, b) =>
      (topicMap.hubs?.has(b.id) ? 1 : 0) - (topicMap.hubs?.has(a.id) ? 1 : 0) ||
      String(a.createdAt || '').localeCompare(String(b.createdAt || '')) ||
      String(a.id).localeCompare(String(b.id)));
    const groups = new Map();
    for (const n of sorted) { const tp = topicMap.get(n.id); if (!groups.has(tp)) groups.set(tp, []); groups.get(tp).push(n); }
    // a topic keeps its slot while it exists; new topics take the lowest free slot (legs first),
    // larger groups first so the dense limbs land at the bottom when the creature is first filled.
    for (const tp of [...slotOf.keys()]) if (!groups.has(tp)) slotOf.delete(tp);
    const used = new Set(slotOf.values());
    const newTopics = [...groups.keys()].filter(tp => !slotOf.has(tp))
      .sort((a, b) => groups.get(b).length - groups.get(a).length || String(a).localeCompare(String(b)));
    for (const tp of newTopics) { let i = 0; while (used.has(i)) i++; slotOf.set(tp, i); used.add(i); }
    limbs = [...groups].map(([topic, ns]) => {
      const slot = slotOf.get(topic);
      const deg = slot < LIMB_SLOTS.length ? LIMB_SLOTS[slot] : -60 + ((slot * 97) % 300);
      // the note whose title is the topic (the hub) sits at the tip / bud centre
      const hub = ns.find(n => n.title === topic);
      const rest = hub ? ns.filter(n => n !== hub) : ns;
      const ids = hub ? [...rest.map(n => n.id).slice(0, 2), hub.id, ...rest.map(n => n.id).slice(2)] : rest.map(n => n.id);
      return {
        topic, slot, angle: deg * DEG, seed: strSeed(topic), ids,
        chain: ids.slice(0, 3), petals: ids.length >= 4 ? ids.slice(3) : [],
      };
    });
    // births: new notes swell out of their parent, root first, so a limb unspools
    let k = 0;
    const fresh = limbs.reduce((c, l) => c + l.ids.filter(id => !anim.has(id)).length, 0);
    const gap = reduced() ? 0 : Math.min(0.14, 2.5 / Math.max(1, fresh)); // whole batch unspools within ~2.5 s
    for (const l of limbs) {
      if (!limbAnim.has(l.topic)) limbAnim.set(l.topic, { sag: 0 });
      [...l.chain, ...l.petals].forEach((id, i) => {
        if (anim.has(id)) return;
        const parent = l.petals.includes(id) ? l.chain[l.chain.length - 1] : i > 0 ? l.chain[i - 1] : null;
        anim.set(id, { x: null, y: null, grow: 0, warm: 1, vis: 1, born: time + k++ * gap, parent });
      });
    }
    for (const id of [...anim.keys()]) if (!byId.has(id)) anim.delete(id);
  }

  function update(state = {}) {
    if (Array.isArray(state.notes)) setNotes(state.notes, state.links || links);
    const cr = state.creature || {};
    brain = { ...brain, ...state };
    for (const k of ['mood', 'hungryFor', 'hungryIds', 'stage', 'flags']) if (cr[k] !== undefined && state[k] === undefined) brain[k] = cr[k];
    const list = brain.disagreements || brain.tensions || brain.contradictions || [];
    // one ask at a time (kiln): only the first open pair flares
    const open = list.find(d => (d.status == null || d.status === 'open') && byId.has(d.a) && byId.has(d.b));
    for (const t of tensions.values()) t.open = false;
    if (open) {
      const key = [open.a, open.b].join('|');
      const t = tensions.get(key);
      if (t) t.open = true; else tensions.set(key, { a: open.a, b: open.b, t0: time, amt: 0, open: true });
    }
  }

  function vitalityOf(n) {
    const v = brain.vitality;
    let x;
    if (typeof v === 'function') x = v(n);
    else if (Array.isArray(v)) x = v.find(e => e.id === n.id)?.vitality;
    else if (v && typeof v === 'object') x = v[n.id];
    if (x == null) x = n.vitality ?? 1;
    if (isGhost(n)) x = Math.min(x, 0.15);
    return Math.max(0.15, x); // floor: never below 15%
  }
  const isGhost = n => !!(n.replacedBy || n.status === 'superseded');

  // suggesting / full: a mood (seven-mood format) or a creature.flags entry (five moods + flags)
  const active = name => brain.mood === name || !!(brain.flags && brain.flags[name]);

  // Hunger per limb. Engram decides how much and (when it names a topic) which limb.
  // clusterHunger() entries with a `topic` droop that limb, scaled by hunger (0..1).
  // hungryFor may be topic strings (current tick) or note titles (older tick).
  // Staleness is only a fallback when nothing was named.
  function limbOfName(key) {
    if (key == null || key === '') return null;
    if (limbs.some(l => l.topic === key)) return key;
    const note = notes.find(n => n.id === key || n.title === key);
    if (note) return limbs.find(l => l.ids.includes(note.id))?.topic || note.topic || null;
    const low = String(key).toLowerCase();
    const l2 = limbs.find(l => String(l.topic).toLowerCase() === low);
    if (l2) return l2.topic;
    const n2 = notes.find(n => String(n.title).toLowerCase() === low);
    return n2 ? (limbs.find(l => l.ids.includes(n2.id))?.topic || n2.topic || null) : null;
  }
  function limbHunger() {
    const h = brain.hunger, out = new Map(), now = brain.now ?? Date.now();
    const bump = (tp, v) => { if (tp == null || tp === '') return; out.set(tp, Math.max(out.get(tp) || 0, v || 0)); };
    let level = brain.mood === 'hungry' || (brain.hungryFor || []).length ? 1 : 0;
    let named = false;
    if (Array.isArray(h)) {
      for (const e of h) {
        level = Math.max(level, smooth(0.4, 0.75, e.hunger || 0));
        if (e.topic != null && e.topic !== '') { bump(e.topic, e.hunger); named = true; continue; }
        if (!e.ids || !e.ids.length || e.ids.length >= 0.6 * Math.max(1, notes.length)) continue;
        for (const l of limbs) {
          const inLimb = e.ids.filter(id => l.ids.includes(id)).length;
          if (inLimb / e.ids.length >= 0.5) { bump(l.topic, e.hunger); named = true; }
        }
      }
    } else if (h && typeof h === 'object') {
      for (const [tp, v] of Object.entries(h)) { bump(limbOfName(tp) || tp, v); named = true; }
    }
    for (const item of brain.hungryFor || []) {
      const tp = limbOfName(item);
      if (tp) { bump(tp, Math.max(level, 1)); named = true; }
    }
    const hid = brain.hungryIds;
    if (Array.isArray(hid) && hid.length && hid.length < 0.6 * Math.max(1, notes.length)) {
      for (const l of limbs) {
        const inLimb = hid.filter(id => l.ids.includes(id)).length;
        if (inLimb / hid.length >= 0.5) { bump(l.topic, Math.max(level, 0.7)); named = true; }
      }
    }
    if (level > 0 && !named) {
      const stale = new Map(limbs.map(l => {
        const ns = l.ids.map(id => byId.get(id)).filter(n => n && !isGhost(n));
        const v = ns.reduce((acc, n) => acc + 1 - Math.pow(0.5, Math.max(0, now - (Date.parse(n.lastTouchedAt || n.createdAt) || now)) / 864e5 / 14), 0) / Math.max(1, ns.length);
        return [l.topic, v];
      }));
      const maxS = Math.max(0, ...stale.values());
      if (maxS > 0.2) for (const l of limbs) bump(l.topic, level * smooth(0.8, 1, stale.get(l.topic) / maxS));
    }
    return out;
  }

  // the limb that gets the "full" bud and offers a new limb
  function fullLimb() {
    if (!active('full')) return null;
    const ids = new Set(brain.flags?.fullCluster || []);
    const pool = ids.size ? limbs.filter(l => l.ids.filter(id => ids.has(id)).length / l.ids.length >= 0.5) : limbs;
    return (pool.length ? pool : limbs).reduce((b, l) => (!b || l.ids.length > b.ids.length ? l : b), null);
  }

  // ---------- simulation ----------
  function step(dt) {
    const R = reduced(), k = R ? 0.35 : 1;
    const mood = brain.mood || 'content';
    const gT = 0.56 + 0.44 * smooth(4, 30, notes.length); // grows with note count
    g = approach(g, gT, dt, 1.8 * k);

    const hunger = limbHunger();
    let hungriest = null;
    for (const l of limbs) {
      const la = limbAnim.get(l.topic);
      const target = clamp(hunger.get(l.topic) || 0, 0, 1);
      la.sag = approach(la.sag, target, dt, (target > la.sag ? 3.2 : 2.2) * k);
      l.sag = la.sag;
      if (!hungriest || l.sag > hungriest.sag) hungriest = l;
    }
    let tiltT = 0, lxT = 0, lyT = 0;
    if (hungriest && hungriest.sag > 0.02) {
      // a gentle attend toward the neglected limb, not a collapse
      const c = Math.cos(hungriest.angle), s = Math.sin(hungriest.angle);
      tiltT = c * 0.17 * hungriest.sag; lxT = c * 12 * hungriest.sag; lyT = Math.max(0, s) * 6 * hungriest.sag;
    }
    sleep = approach(sleep, mood === 'sleepy' ? 1 : 0, dt, 1.5 * k);
    curious = approach(curious, mood === 'curious' || active('suggesting') ? 1 : 0, dt, 1 * k);
    suggest = approach(suggest, active('suggesting') ? 1 : 0, dt, 1.2 * k);
    const fl = fullLimb();
    for (const l of limbs) { const la = limbAnim.get(l.topic); la.full = approach(la.full || 0, l === fl ? 1 : 0, dt, (l === fl ? 2.4 : 1.5) * k); l.full = la.full; }
    full = approach(full, fl ? 1 : 0, dt, 1.5 * k);
    tiltT += 0.07 * sleep - 0.05 * curious; lyT += 7 * sleep;
    tilt = approach(tilt, tiltT, dt, 1.4 * k);
    leanX = approach(leanX, lxT, dt, 1.4 * k); leanY = approach(leanY, lyT, dt, 1.4 * k);

    let anyOpen = false;
    for (const [key, t] of tensions) {
      anyOpen ||= t.open;
      t.amt = approach(t.amt, t.open ? 1 : 0, dt, (t.open ? 0.3 : 1.8) * k);
      if (!t.open && t.amt < 0.01) tensions.delete(key);
    }
    tense = approach(tense, anyOpen ? 1 : 0, dt, (anyOpen ? 0.35 : 1.5) * k);
    phase += dt / (2.6 + 2.2 * sleep);
    layout(dt, R, k);
  }

  function layout(dt, R, k) {
    const s = U * g, tn = R ? 0 : time;
    const br = R ? 0 : Math.sin((2 * Math.PI * phase) / 1) * (1 - 0.5 * tense);
    const { cx, cy } = visible();
    const T = { x: cx + leanX * U * 0.35, y: cy + leanY * U * 0.3 };
    const tr = { rx: 68 * s * (1 + 0.012 * br), ry: 78 * s * (1 + 0.016 * br) };
    const neck = { x: T.x, y: T.y - 70 * s };
    const [hx, hy] = rot(10 * s, -82 * s, tilt);
    const Hc = { x: neck.x + hx + leanX * U, y: neck.y + hy + leanY * U - 3 * tense * U + br * 0.8 * U };
    const hr = { rx: 80 * s, ry: 72 * s };
    const onTorso = a => ({ x: T.x + Math.cos(a) * tr.rx, y: T.y + Math.sin(a) * tr.ry });
    const deco = [];

    const head = HEAD_RING.map(([deg, r], i) => {
      const [ox, oy] = rot(Math.cos(deg * DEG) * hr.rx * 0.9, Math.sin(deg * DEG) * hr.ry * 0.9, tilt);
      const d = { x: Hc.x + ox, y: Hc.y + oy + (R ? 0 : (noise(i * 3.1 + tn * 0.3) - 0.5) * 1.5 * U), r: r * 1.3 * s, kind: 'head', i };
      deco.push(d); return d;
    });
    const eyes = [[-16, 4, 21], [40, -14, 25]].map(([ex, ey, r]) => {
      const [ox, oy] = rot(ex * s, ey * s, tilt);
      return { x: Hc.x + ox, y: Hc.y + oy, r: r * s, kind: 'eye' };
    });
    const torsoAngles = [...TORSO_FIXED.map(d => d * DEG), ...limbs.map(l => l.angle)]
      .filter((a, i, arr) => arr.findIndex(b => Math.abs(angDiff(a, b)) < 14 * DEG) === i);
    const torso = torsoAngles.map((a, i) => {
      const p = onTorso(a);
      const d = { x: p.x, y: p.y + br * 1.2 * U, r: 8.6 * s, kind: 'torso', a, i };
      deco.push(d); return d;
    });
    torso.sort((p, q) => ((p.a + 2 * Math.PI) % (2 * Math.PI)) - ((q.a + 2 * Math.PI) % (2 * Math.PI)));

    const targets = new Map();
    for (const l of limbs) {
      const sag = l.sag || 0;
      const root = onTorso(l.angle); root.y += br * 1.2 * U;
      l.root = root;
      const curl = (hash(l.seed) - 0.5) * 18 * DEG;
      const n = l.chain.length;
      let px = root.x, py = root.y, th = l.angle;
      l.chain.forEach((id, i) => {
        th = l.angle + curl * (i + 1) * 0.6;
        th += angDiff(Math.PI / 2, th) * Math.min(0.95, sag * 1.0 * (i + 1) / Math.max(2, n));
        th += R ? 0 : 0.035 * Math.sin(tn * 0.7 + l.seed + i * 1.3);
        const L = (i === 0 ? 60 : 52) * s * (1 + 0.45 * sag) * (1 - 0.07 * tense);
        px += Math.cos(th) * L; py += Math.sin(th) * L;
        const tip = i === n - 1;
        targets.set(id, { x: px, y: py, r: (tip && l.petals.length ? 12 : tip ? 10.5 : 9) * s * (tip ? 1 + 0.15 * (l.full || 0) : 1), limb: l, depth: (i + 1) / Math.max(n, 3), tip });
      });
      l.tipTheta = th;
      const tipId = l.chain[n - 1], tipT = targets.get(tipId);
      const np = l.petals.length, pr = (19 + 1.2 * np) * s * (1 + 0.22 * (l.full || 0));
      l.petals.forEach((id, j) => {
        const a = (j / np) * 2 * Math.PI + l.seed + tn * 0.04;
        targets.set(id, { x: tipT.x + Math.cos(a) * pr, y: tipT.y + Math.sin(a) * pr + sag * pr * 0.45, r: 4.6 * s * (1 + 0.3 * (l.full || 0)), limb: l, depth: 1, petal: true, tip: tipId, pr });
      });
    }

    // contradictions: pull the pair taut toward each other, twitch, then hold
    for (const t of tensions.values()) {
      const A = targets.get(t.a), B = targets.get(t.b);
      if (!A || !B) continue;
      // the pair steps into the chest and faces off across it (sketch 04); limb threads stretch to follow
      const left = A.x <= B.x ? A : B, right = left === A ? B : A, pull = 0.85 * t.amt;
      const cy2 = T.y - 0.08 * tr.ry;
      left.x += (T.x - 0.62 * tr.rx - left.x) * pull; left.y += (cy2 - left.y) * pull;
      right.x += (T.x + 0.62 * tr.rx - right.x) * pull; right.y += (cy2 - right.y) * pull;
      const el = time - t.t0;
      t.env = t.open && !R && el < 1.6 ? Math.exp(-el / 0.35) : 0;
      const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1;
      const w = t.env * 3.2 * U * Math.sin(el * 2 * Math.PI * 14);
      A.x += (-dy / d) * w; A.y += (dx / d) * w; B.x -= (-dy / d) * w; B.y -= (dx / d) * w;
    }

    // animate note nodes toward their targets
    const out = [];
    for (const [id, T2] of targets) {
      const a = anim.get(id), n = byId.get(id);
      if (!a || !n) continue;
      const parentT = a.parent ? anim.get(a.parent) : null;
      const origin = parentT && parentT.x != null ? parentT : T2.limb.root;
      if (a.x == null) { a.x = origin.x; a.y = origin.y; }
      if (time < a.born) { a.x = origin.x; a.y = origin.y; }
      else {
        a.grow = approach(a.grow, 1, dt, 0.8 * k);
        a.x = approach(a.x, T2.x, dt, 0.75 * k); a.y = approach(a.y, T2.y, dt, 0.75 * k);
      }
      const sag = T2.limb.sag || 0;
      const wT = 1 - sag * (0.45 + 0.4 * T2.depth); // stays softly lit, never out
      // warmth returns core-outward; cooling starts at the tip
      const tau = wT > a.warm ? 0.5 + T2.depth * 2.2 : 1.4 + (1 - T2.depth) * 1.8;
      a.warm = approach(a.warm, wT, dt, tau * k);
      a.vis = approach(a.vis, vitalityOf(n), dt, 1.2 * k);
      out.push({ id, note: n, x: a.x, y: a.y, r: T2.r * a.grow, grow: a.grow, warm: a.warm, vis: a.vis, ghost: isGhost(n), limb: T2.limb, petal: T2.petal, tipId: T2.tip, pr: T2.pr });
    }
    // "full": a new limb unspools from the heavy bud, offered, not yet grown (decorative nodes)
    const sprouts = [];
    for (const l of limbs) {
      if (!(l.full > 0.02)) continue;
      const tip = out.find(o => o.id === l.chain[l.chain.length - 1]); if (!tip) continue;
      const a0 = l.tipTheta + 0.75 * (Math.cos(l.tipTheta) >= 0 ? -1 : 1);
      let x = tip.x, y = tip.y; const pts = [{ x, y }];
      for (let i = 0; i < 3; i++) {
        const grow = clamp(l.full * 3 - i, 0, 1);
        const a = a0 + (i * 0.25 + (R ? 0 : 0.05 * Math.sin(tn * 0.8 + i))) * (Math.cos(l.tipTheta) >= 0 ? -1 : 1);
        const L = (i ? 26 : 34) * s * grow;
        x += Math.cos(a) * L; y += Math.sin(a) * L;
        pts.push({ x, y, r: (i === 2 ? 5.5 : 3.8) * s * grow, grow });
      }
      sprouts.push(pts);
    }
    frame = { sprouts, notes: out, byId: new Map(out.map(o => [o.id, o])), deco, head, torso, eyes, br, Hc, hr, T, tr, s, tn };
  }

  // ---------- drawing ----------
  function buildBg() {
    bg = document.createElement('canvas');
    bg.width = Math.max(1, W * dpr); bg.height = Math.max(1, H * dpr);
    const b = bg.getContext('2d'); b.scale(dpr, dpr);
    b.fillStyle = PAL.night; b.fillRect(0, 0, W, H);
    const v = visible(), m = Math.min(v.w, v.h), mx = v.l + v.w * 0.84, my = v.t + v.h * 0.14;
    const rad = (x, y, r, c, a) => { const gr = b.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, rgba(c, a)); gr.addColorStop(1, rgba(c, 0)); b.fillStyle = gr; b.fillRect(x - r, y - r, 2 * r, 2 * r); };
    rad(mx, my, m * 0.45, C.lifted, 0.9);
    for (let i = 0; i < 70; i++) {
      const r = m * (0.02 + hash(i * 3.7) * 0.07);
      rad(mx + (hash(i * 1.3 + 2) - 0.5) * m * 0.36, my + (hash(i * 2.9 + 5) - 0.5) * m * 0.26, r, i % 3 ? C.lifted : C.membrane, 0.16);
    }
    rad(mx, my, m * 0.13, C.moon, 0.2);
    rad(mx + m * 0.005, my - m * 0.004, m * 0.045, C.moon, 0.32);
    for (let i = 0; i < 26; i++) rad(mx + (hash(i + 90) - 0.5) * m * 0.12, my + (hash(i + 140) - 0.5) * m * 0.1, m * 0.02, C.moon, 0.05);
    // faint specks and grain
    for (let i = 0; i < 3500; i++) {
      b.fillStyle = rgba(i % 2 ? C.thread : C.night, 0.035);
      b.fillRect(hash(i * 1.17) * W, hash(i * 2.31 + 9) * H, 1, 1);
    }
    for (let i = 0; i < 40; i++) { b.fillStyle = rgba(C.thread, 0.08 + hash(i) * 0.1); b.fillRect(hash(i * 5.3 + 1) * W, hash(i * 7.1 + 3) * H, 1, 1); }
    const vig = b.createRadialGradient(W / 2, H / 2, m * 0.3, W / 2, H / 2, Math.max(W, H) * 0.8);
    vig.addColorStop(0, 'rgba(4,5,9,0)'); vig.addColorStop(1, 'rgba(4,5,9,0.35)');
    b.fillStyle = vig; b.fillRect(0, 0, W, H);
  }

  function blobPath(c, rx, ry, a0, seed, tn) {
    const N = 22, pts = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * 2 * Math.PI;
      const j = 1 + (noise(seed + i * 0.9 + tn * 0.12) - 0.5) * 0.1;
      const [x, y] = rot(Math.cos(a) * rx * j, Math.sin(a) * ry * j, a0);
      pts.push([c.x + x, c.y + y]);
    }
    const p = new Path2D();
    const mid = (i) => { const A = pts[i % N], B = pts[(i + 1) % N]; return [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2]; };
    p.moveTo(...mid(0));
    for (let i = 1; i <= N; i++) p.quadraticCurveTo(...pts[i % N], ...mid(i));
    p.closePath();
    return p;
  }

  // thin, slightly irregular thread like spider silk
  function thread(ax, ay, bx, by, o) {
    const { color = C.thread, alpha = 0.4, width = 0.9, seed = 0, wob = 1, bow = 0, dash = null, strands = 2 } = o;
    if (alpha <= 0.004) return;
    const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
    const N = Math.max(6, Math.ceil(d / 7)), tn = frame.tn;
    ctx.lineCap = 'round'; ctx.setLineDash(dash || []);
    for (let sI = 0; sI < strands; sI++) {
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const t = i / N, env = Math.sin(Math.PI * t);
        const w = (wob * U * 3.2 * (noise(seed + sI * 7.7 + i * 0.45 + tn * 0.18) - 0.5) + bow * d * 0.5) * env + (sI ? 0.9 * U * env : 0);
        const x = ax + dx * t + nx * w, y = ay + dy * t + ny * w;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.strokeStyle = rgba(color, sI ? alpha * 0.35 : alpha);
      ctx.lineWidth = Math.max(0.5, width * U * 1.25) * (sI ? 0.7 : 1);
      ctx.stroke();
    }
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
  }

  function node(x, y, r, col, alpha, glow = 1) {
    if (r <= 0.2 || alpha <= 0.004) return;
    const hr = r * 4.2 * glow;
    let gr = ctx.createRadialGradient(x, y, r * 0.4, x, y, hr);
    gr.addColorStop(0, rgba(col.halo, 0.26 * alpha * glow)); gr.addColorStop(0.4, rgba(col.halo, 0.08 * alpha)); gr.addColorStop(1, rgba(col.halo, 0));
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, hr, 0, 7); ctx.fill();
    gr = ctx.createRadialGradient(x, y, 0, x, y, r * 1.35);
    gr.addColorStop(0, rgba(col.core, alpha)); gr.addColorStop(0.45, rgba(col.mid, 0.9 * alpha)); gr.addColorStop(1, rgba(col.mid, 0));
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r * 1.35, 0, 7); ctx.fill();
    ctx.strokeStyle = rgba(col.halo, 0.22 * alpha); ctx.lineWidth = Math.max(0.5, 0.6 * U);
    ctx.beginPath(); ctx.arc(x, y, r * 1.18, 0, 7); ctx.stroke();
    ctx.fillStyle = rgba(mix(col.core, WHITE, 0.4), alpha); ctx.beginPath(); ctx.arc(x, y, r * 0.38, 0, 7); ctx.fill();
  }

  const GOLD = { core: C.core, mid: C.mid, halo: C.halo };
  function noteColors(warm) {
    const w = 1 - warm;
    return { core: mix(C.core, C.ash1, w), mid: mix(C.mid, C.ash2, w), halo: mix(C.halo, C.ash3, w) };
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (bg) ctx.drawImage(bg, 0, 0, W, H); else { ctx.fillStyle = PAL.night; ctx.fillRect(0, 0, W, H); }
    const f = frame; if (!f.T) return;
    const { br, s, tn } = f;
    const bright = 1 - 0.32 * sleep;
    const glow = (1 + 0.09 * br) * (1 + 0.1 * full);

    // membrane: head + torso blobs as one faint indigo body, outlined like silk
    const headP = blobPath(f.Hc, 92 * s * (1 + 0.01 * br), 84 * s, tilt, 3.3, tn);
    const torsoP = blobPath(f.T, f.tr.rx * 1.06, f.tr.ry * 1.06, 0, 8.1, tn);
    const body = new Path2D(); body.addPath(headP); body.addPath(torsoP);
    ctx.fillStyle = rgba(C.membrane, 0.4 * bright); ctx.fill(body, 'nonzero');
    const outline = (p, other) => {
      ctx.save(); const clip = new Path2D(); clip.rect(0, 0, W, H); clip.addPath(other); ctx.clip(clip, 'evenodd');
      ctx.strokeStyle = rgba(C.threadDim, 0.22 * bright); ctx.lineWidth = Math.max(0.5, 0.8 * U); ctx.stroke(p);
      ctx.strokeStyle = rgba(C.thread, 0.08 * bright); ctx.lineWidth = Math.max(1, 3 * U); ctx.stroke(p);
      ctx.restore();
    };
    outline(headP, torsoP); outline(torsoP, headP);

    // structure threads
    const ta = 0.42 * bright;
    f.head.forEach((p, i) => { const q = f.head[i + 1]; if (q) thread(p.x, p.y, q.x, q.y, { alpha: ta, seed: 11 + i }); });
    const tor = f.torso;
    tor.forEach((p, i) => { const q = tor[(i + 1) % tor.length]; thread(p.x, p.y, q.x, q.y, { alpha: ta * 0.8, seed: 31 + i, bow: 0.12 }); });
    if (tor.length > 3) {
      for (let i = 0; i < 2; i++) { const p = tor[i], q = tor[(i + Math.floor(tor.length / 2)) % tor.length]; thread(p.x, p.y, q.x, q.y, { alpha: ta * 0.35, seed: 51 + i, bow: 0.18 * (i ? 1 : -1), color: C.threadDim }); }
    }
    // neck: lower head ring to shoulders
    const shoulders = tor.filter(p => Math.sin(p.a) < -0.5);
    if (shoulders.length) {
      const near = (x, y) => shoulders.reduce((b, p) => (Math.hypot(p.x - x, p.y - y) < Math.hypot(b.x - x, b.y - y) ? p : b));
      for (const h of [f.head[0], f.head[f.head.length - 1]]) { const q = near(h.x, h.y); thread(h.x, h.y, q.x, q.y, { alpha: ta * 0.8, seed: 71 + h.i }); }
    }
    // limbs
    for (const l of limbs) {
      const sag = l.sag || 0;
      let prev = l.root;
      l.chain.forEach((id, i) => {
        const o = f.byId.get(id); if (!o) return;
        const col = mix(C.thread, C.ash1, (1 - o.warm) * 0.8);
        thread(prev.x, prev.y, o.x, o.y, { color: col, alpha: ta * Math.max(0.25, o.vis) * (1 - 0.45 * sag) * Math.min(1, o.grow * 1.5), width: 0.95 * (1 - 0.45 * sag), seed: l.seed + i * 5, wob: 1.2 });
        prev = o;
      });
      const tip = f.byId.get(l.chain[l.chain.length - 1]);
      if (tip && l.petals.length) {
        ctx.strokeStyle = rgba(mix(C.thread, C.ash1, 1 - tip.warm), 0.16 * bright * Math.min(...l.petals.map(id => f.byId.get(id)?.grow ?? 0)));
        ctx.lineWidth = Math.max(0.5, 0.6 * U);
        ctx.beginPath(); ctx.ellipse(tip.x, tip.y + sag * 0.45 * (19 + 1.2 * l.petals.length) * s, (19 + 1.2 * l.petals.length) * s, (19 + 1.2 * l.petals.length) * s, 0, 0, 7); ctx.stroke();
        for (const id of l.petals) { const p = f.byId.get(id); if (p) thread(tip.x, tip.y, p.x, p.y, { color: mix(C.thread, C.ash1, 1 - p.warm), alpha: ta * 0.6 * p.grow * Math.max(0.25, p.vis), width: 0.6, seed: strSeed(id), wob: 0.4, strands: 1 }); }
      }
    }
    // links from the note format: confirmed lit, suggested faint + dotted, rejected not drawn
    let crossCount = 0;
    for (const lk of links) { const a = f.byId.get(lk.from), b = f.byId.get(lk.to); if (a && b && lk.status === 'confirmed' && a.limb !== b.limb) crossCount++; }
    const crossA = Math.max(0.12, Math.min(1, 8 / Math.max(1, crossCount))); // dense graphs stay silk, not a hairball
    for (const lk of links) {
      const a = f.byId.get(lk.from), b = f.byId.get(lk.to);
      if (!a || !b || lk.status === 'rejected') continue;
      const v = Math.min(a.vis, b.vis) * Math.min(a.grow, b.grow);
      const sameChain = a.limb === b.limb && (a.limb.chain.includes(a.id) && a.limb.chain.includes(b.id) && Math.abs(a.limb.chain.indexOf(a.id) - a.limb.chain.indexOf(b.id)) === 1);
      const bow = a.limb === b.limb ? 0.12 : 0.2;
      if (lk.status === 'confirmed') {
        if (sameChain) continue; // already a lit structural thread
        const cross = a.limb !== b.limb;
        thread(a.x, a.y, b.x, b.y, { color: cross ? C.threadDim : C.thread, alpha: 0.38 * v * bright * (cross ? crossA : 1), width: cross ? 0.7 : 0.9, seed: strSeed(lk.id), bow, wob: 0.8, strands: cross ? 1 : 2 });
      } else {
        // suggesting: the one pending link (one ask at a time) shimmers along its dots; its ends get a cool ring
        const asking = suggest > 0.01 && lk === links.find(x => x.status === 'suggested' && f.byId.get(x.from) && f.byId.get(x.to));
        if (asking) {
          ctx.lineDashOffset = frame.tn ? -time * 5 * U : 0;
          for (const e of [a, b]) { ctx.strokeStyle = rgba(C.halo, 0.35 * suggest * (0.8 + 0.2 * f.br)); ctx.lineWidth = Math.max(0.5, 0.7 * U); ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 2.1, 0, 7); ctx.stroke(); }
        }
        thread(a.x, a.y, b.x, b.y, { color: asking ? C.thread : C.threadDim, alpha: (0.32 + (asking ? 0.4 * suggest : 0)) * v * bright, width: asking ? 1.1 : 0.8, seed: strSeed(lk.id), bow: -bow, wob: 0.5, dash: [Math.max(1, 1.2 * U), Math.max(4, 5.5 * U)], strands: 1 });
      }
    }
    // full: the offered limb, faint and dotted until the person says yes
    for (const pts of f.sprouts || []) {
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i - 1], q = pts[i];
        if (q.grow > 0.01) thread(p.x, p.y, q.x, q.y, { color: C.thread, alpha: 0.55 * q.grow * bright, width: 0.8, seed: 90 + i, wob: 0.6, strands: 1, dash: [Math.max(1, 1.5 * U), Math.max(3, 4 * U)] });
      }
    }
    // contradiction threads: taut, coral into violet
    for (const t of tensions.values()) {
      const a = f.byId.get(t.a), b = f.byId.get(t.b); if (!a || !b) continue;
      const gr = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      gr.addColorStop(0, rgba(C.warmA, 1)); gr.addColorStop(0.5, rgba(mix(C.warmA, C.coolA, 0.5), 1)); gr.addColorStop(1, rgba(C.coolA, 1));
      const loose = 1 - t.amt;
      ctx.save(); ctx.globalAlpha = 0.9 * t.amt;
      for (let i = 0; i < 3; i++) {
        const off = (i - 1) * 1.6 * U, dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
        ctx.beginPath();
        const N = 14;
        for (let j = 0; j <= N; j++) {
          const u = j / N, env = Math.sin(Math.PI * u);
          const w = off * env + (loose * 6 * U + (t.env || 0) * 2.5 * U * Math.sin(time * 90 + j)) * env * (noise(i * 5 + j * 0.6 + tn * 0.3) - 0.5) * 2;
          const x = a.x + dx * u + nx * w, y = a.y + dy * u + ny * w;
          j ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.strokeStyle = gr; ctx.lineWidth = Math.max(0.6, (i === 1 ? 1.4 : 0.7) * U); ctx.stroke();
      }
      ctx.restore();
    }

    // nodes
    const tor_col = GOLD;
    for (const d of f.deco) node(d.x, d.y, d.r, tor_col, 0.85 * bright, glow);
    for (const pts of f.sprouts || []) for (const q of pts.slice(1)) if (q.r) node(q.x, q.y, q.r * 1.2, GOLD, 0.8 * q.grow * bright, glow);
    for (const o of f.notes) {
      let col = noteColors(o.warm), alpha = (0.2 + 0.8 * o.vis) * bright * Math.min(1, o.grow * 1.3), r = o.r * (0.85 + 0.15 * o.vis), gl = glow * (0.75 + 0.25 * o.warm);
      for (const t of tensions.values()) {
        const side = o.id === t.a ? 'w' : o.id === t.b ? 'c' : null;
        if (!side) continue;
        let fl = t.amt * (1 + 0.35 * (t.env || 0) * Math.sin(time * 47));
        fl = clamp(fl, 0, 1.2);
        const A = side === 'w' ? C.warmA : C.coolA, B = side === 'w' ? C.warmB : C.coolB;
        col = { core: mix(col.core, mix(WHITE, A, 0.45), Math.min(1, fl)), mid: mix(col.mid, A, Math.min(1, fl)), halo: mix(col.halo, B, Math.min(1, fl)) };
        alpha = Math.max(alpha, Math.min(1, fl)); r = Math.max(r, 9 * f.s) * (1 + 0.45 * Math.min(1, fl)); gl *= 1 + 0.9 * Math.min(1, fl);
      }
      if (o.ghost) {
        // replaced note: a ghost ring, kept forever
        ctx.strokeStyle = rgba(mix(C.thread, C.ash1, 0.4), 0.35 * Math.max(alpha, 0.15) / 0.15 * 0.15 + 0.12);
        ctx.lineWidth = Math.max(0.5, 0.8 * U); ctx.beginPath(); ctx.arc(o.x, o.y, r * 1.1, 0, 7); ctx.stroke();
        node(o.x, o.y, r * 0.7, col, alpha * 0.8, 0.8);
      } else node(o.x, o.y, r, col, alpha, gl);
      if (hovered === o.id) { ctx.strokeStyle = rgba(C.halo, 0.5); ctx.lineWidth = Math.max(0.5, 0.8 * U); ctx.beginPath(); ctx.arc(o.x, o.y, r * 2, 0, 7); ctx.stroke(); }
    }
    // eyes stay gold, always
    const eyeA = (1 - 0.4 * sleep) * bright, eyeG = glow * (1 + 0.15 * curious);
    for (const e of f.eyes) node(e.x, e.y, e.r * (1 - 0.15 * sleep), GOLD, eyeA, eyeG);
  }

  // ---------- loop, sizing, input ----------
  function relayout() {
    if (!W || !H) return;
    applySize();
    buildBg();
    const R = reduced();
    layout(0, R, R ? 0.35 : 1);
  }
  function setInset(v) {
    inset = normInset(v);
    relayout();
  }
  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    relayout();
  }
  // CSS px relative to the canvas (same space as pointer events). If the canvas is
  // position:fixed; inset:0, these are also viewport coordinates.
  function point(x, y, r, name) { return (x == null || y == null) ? null : { x, y, r: r || 0, name }; }
  function getNodePosition(id) {
    const o = frame.byId?.get(id);
    return o ? point(o.x, o.y, o.r, id) : null;
  }
  function getAnchor(name = 'head') {
    const f = frame, key = name || 'head';
    if (!f || !f.Hc) return null;
    if (key === 'head') return point(f.Hc.x, f.Hc.y, Math.max(f.hr.rx, f.hr.ry), 'head');
    if (key === 'torso' || key === 'chest') return point(f.T.x, f.T.y, Math.max(f.tr.rx, f.tr.ry), key);
    if (key === 'eyes' && f.eyes?.length) {
      const es = f.eyes;
      return point(es.reduce((s, e) => s + e.x, 0) / es.length, es.reduce((s, e) => s + e.y, 0) / es.length, Math.max(...es.map(e => e.r)) * 2, 'eyes');
    }
    return getNodePosition(key);
  }
  function tick(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now; time += dt;
    step(dt); draw();
    raf = requestAnimationFrame(tick);
  }
  function pick(ev) {
    const r = canvas.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    let best = null, bd = Infinity;
    for (const o of frame.notes) { const d = Math.hypot(o.x - x, o.y - y); if (d < Math.max(12, o.r * 2.4) && d < bd) { bd = d; best = o; } }
    return best;
  }
  const onClick = ev => { const o = pick(ev); if (o) for (const fn of handlers.click) fn(o.note, { x: o.x, y: o.y, event: ev }); };
  const onMove = ev => {
    const o = pick(ev), id = o ? o.id : null;
    canvas.style.cursor = o ? 'pointer' : '';
    if (id !== hovered) { hovered = id; for (const fn of handlers.hover) fn(o ? o.note : null, o ? { x: o.x, y: o.y, event: ev } : null); }
  };
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('pointermove', onMove);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  ro ? ro.observe(canvas) : window.addEventListener('resize', resize);
  resize();
  raf = requestAnimationFrame(tick);

  return {
    setNotes, update,
    onNodeClick(fn) { handlers.click.add(fn); return () => handlers.click.delete(fn); },
    onNodeHover(fn) { handlers.hover.add(fn); return () => handlers.hover.delete(fn); },
    setReducedMotion(v) { reducedOverride = v; },
    getNodePosition, getAnchor, setInset,
    getInset() { return { ...inset }; },
    getLimbs() { return limbs.map(l => ({ topic: l.topic, ids: l.ids.slice(), chain: l.chain.slice(), petals: l.petals.slice(), sag: l.sag || 0, angle: l.angle })); },
    get stage() { return brain.stage || (notes.length < 8 ? 'hatchling' : notes.length < 20 ? 'growing' : 'well_fed'); },
    resize,
    destroy() { cancelAnimationFrame(raf); ro && ro.disconnect(); canvas.removeEventListener('click', onClick); canvas.removeEventListener('pointermove', onMove); },
  };
}

// Default limb grouping: note.topic is the limb label.
// Notes without a topic inherit one from the nearest confirmed-link neighbour that has one
// (the first confirmed link, as in Forge's shell). If no note carries a topic, fall back to:
// 1) tag mode: each note's most specific shared tag (used by 2+ notes and by < 60% of them).
// 2) hub mode, when tags don't split the graph: the best-connected notes become limb roots
//    and every other note joins the hub it is linked to (confirmed links).
export function groupTopics(notes, links = [], maxLimbs = 5) {
  const ids = new Set(notes.map(n => n.id));
  const confirmedLinks = links.filter(l => l.status === 'confirmed' && ids.has(l.from) && ids.has(l.to))
    .slice().sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a.id).localeCompare(String(b.id)));
  if (notes.some(n => n.topic)) {
    const adj = new Map(notes.map(n => [n.id, []]));
    for (const l of confirmedLinks) { adj.get(l.from).push(l.to); adj.get(l.to).push(l.from); }
    const topicOf = new Map();
    for (const n of notes) if (n.topic) topicOf.set(n.id, n.topic);
    let frontier = [...topicOf.keys()];
    while (frontier.length) {
      const next = [];
      for (const id of frontier) for (const x of adj.get(id) || []) if (!topicOf.has(x)) { topicOf.set(x, topicOf.get(id)); next.push(x); }
      frontier = next;
    }
    return new Map(notes.map(n => [n.id, topicOf.get(n.id) || (n.tags && n.tags[0]) || 'loose']));
  }
  const N = notes.length, freq = new Map();
  for (const n of notes) for (const t of new Set(n.tags || [])) freq.set(t, (freq.get(t) || 0) + 1);
  const useful = t => freq.get(t) >= 2 && freq.get(t) < 0.6 * N;
  const byTag = new Map();
  for (const n of notes) {
    const tags = (n.tags || []).filter(useful).sort((a, b) => freq.get(a) - freq.get(b));
    byTag.set(n.id, tags[0] ?? null);
  }
  const sizes = new Map();
  for (const t of byTag.values()) if (t) sizes.set(t, (sizes.get(t) || 0) + 1);
  const tagged = [...byTag.values()].filter(Boolean).length;
  const ok = sizes.size >= 2 && Math.max(...sizes.values()) < 0.6 * N && tagged >= 0.7 * N;
  if (ok || N < 3) {
    const m = new Map(notes.map(n => [n.id, byTag.get(n.id) || (n.tags && n.tags[0]) || 'untagged']));
    return m;
  }
  const adj = new Map(notes.map(n => [n.id, []]));
  for (const l of links) if (l.status === 'confirmed' && ids.has(l.from) && ids.has(l.to)) { adj.get(l.from).push(l.to); adj.get(l.to).push(l.from); }
  const deg = id => adj.get(id).length;
  const hubs = [];
  for (const n of notes.slice().sort((a, b) => deg(b.id) - deg(a.id))) {
    if (hubs.length >= maxLimbs || deg(n.id) < 2) break;
    if (hubs.some(h => adj.get(h).includes(n.id))) continue; // keep hubs apart
    hubs.push(n.id);
  }
  const m = new Map(hubs.map(h => [h, h]));
  // breadth-first from all hubs at once: each note joins the nearest hub
  let frontier = [...hubs];
  while (frontier.length) {
    const next = [];
    for (const id of frontier) {
      const nb = adj.get(id).slice().sort((a, b) => deg(a) - deg(b));
      for (const x of nb) if (!m.has(x)) { m.set(x, m.get(id)); next.push(x); }
    }
    frontier = next;
  }
  // anything not reachable from a hub: its own small limb (best-connected note first), else loose
  for (const n of notes.slice().sort((a, b) => deg(b.id) - deg(a.id))) {
    if (m.has(n.id)) continue;
    if (!deg(n.id)) { m.set(n.id, 'loose'); continue; }
    hubs.push(n.id); m.set(n.id, n.id);
    let fr = [n.id];
    while (fr.length) { const nx = []; for (const id of fr) for (const x of adj.get(id)) if (!m.has(x)) { m.set(x, n.id); nx.push(x); } fr = nx; }
  }
  m.hubs = new Set(hubs);
  return m;
}
