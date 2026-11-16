import fs from 'node:fs';
import assert from 'node:assert';
const R = new URL('../../', import.meta.url).pathname;
const S = await import(R + 'app/store.js');
const seed = JSON.parse(fs.readFileSync(R + 'seed/waystone-first-meal.json'));
const lines = JSON.parse(fs.readFileSync(R + 'voice/waystone-lines.json'));
let st = S.tick(structuredClone(seed));
console.log('seed mood', st.creature.mood, st.creature.stage, st.creature.flags);
console.log('speech', S.speech(st, lines, { hunger: S.clusterHunger(st) }));
let r = S.newNote(st, 'new york setbacks were never about sun reaching the street, actually about light for offices #zoning', 'voice');
console.log(r.note);
assert.equal(r.note.source, 'voice'); assert.equal(r.note.vitality, 1); assert.ok(r.note.tags.includes('new york'));
st = S.suggestLinks(r.store, r.note.id).store;
const sug = S.openSuggestion(st); console.log('suggestion', sug);
assert.equal(sug.status, 'suggested'); assert.equal(sug.suggestedBy, 'brain');
st = S.tick(st, Date.now(), { justAdded: true });
console.log('speech after add', S.speech(st, lines, { hunger: S.clusterHunger(st), lastNoteId: r.note.id }));
st = S.confirmLink(st, sug.id);
assert.equal(st.links.find(l => l.id === sug.id).status, 'confirmed');
console.log('topic inherited', st.notes.find(n => n.id === r.note.id).topic);
st = await S.detectContradictions(st);
const arg = S.openArgument(st); console.log('argument', arg);
assert.ok(arg); const A = st.notes.find(n => n.id === arg.a), B = st.notes.find(n => n.id === arg.b);
assert.ok(A.createdAt <= B.createdAt, 'a older');
st = S.tick(st);
console.log('mood', st.creature.mood, S.speech(st, lines, { hunger: S.clusterHunger(st) }));
const st2 = S.resolve(st, arg.id, 'newer_wins');
assert.equal(st2.notes.find(n => n.id === arg.a).replacedBy, arg.b);
assert.equal(st2.notes.length, st.notes.length, 'never deletes');
const st3 = S.resolve(st, arg.id, 'merged', 'setbacks: sun for the street and light for offices');
console.log('merged', st3.notes.at(-1).id, st3.notes.at(-1).title, st3.notes.filter(n => n.replacedBy).map(n => n.id));
// reject: never re-suggested
let s4 = S.rejectLink(st, st.links.at(-1).id);
// hunger: age everything 40 days except one cluster
const old = new Date(Date.now() - 40 * 864e5).toISOString();
let h = structuredClone(seed); h.notes = h.notes.map((n, i) => ({ ...n, lastTouchedAt: i < 25 ? old : new Date().toISOString() }));
h = S.tick(h); const hu = S.clusterHunger(h);
console.log('hungry mood', h.creature.mood, 'hungryFor', h.creature.hungryFor, 'droop', S.droopingLimb(h, hu));
console.log('hungry speech', S.speech(h, lines, { hunger: hu }));
// naming
let nm = st; for (let i = 0; i < 10; i++) nm = S.newNote(nm, 'note number ' + i + ' about bread').store;
const named = S.maybeName(nm); console.log('named', named.named, named.store.creature.name, S.speech(named.store, lines, { event: 'named' }).text);
console.log('ALL OK');
{
const old = new Date(Date.now() - 40 * 864e5).toISOString(), recent = new Date(Date.now() - 2 * 864e5).toISOString();
let h = structuredClone(seed);
h.notes = h.notes.map(n => ({ ...n, lastTouchedAt: n.topic === 'water' ? old : recent }));
h = S.tick(h); const hu = S.clusterHunger(h);
console.log('T2 mood', h.creature.mood, hu.slice(0,3).map(x=>[x.ids.length,x.hunger.toFixed(2)]), S.droopingLimb(h, hu).topic, S.droopingLimb(h, hu).note);
let h2 = structuredClone(seed); h2.notes = h2.notes.map(n => ({ ...n, lastTouchedAt: old }));
h2 = S.newNote(h2, 'bread in lisbon').store; h2 = S.tick(h2); const hu2 = S.clusterHunger(h2);
console.log('T3 mood', h2.creature.mood, hu2[0].hunger.toFixed(2), S.speech(h2, lines, { hunger: hu2 }));
}

{ // arguing lines quote ~8 words of each note's text, older first
  let a = S.newNote(structuredClone(seed), 'the bologna porticoes were built so people could walk in the rain', 'text', Date.now() - 864e5).store;
  const r2 = S.newNote(a, 'bologna porticoes were never about rain, they were for market stalls');
  a = S.suggestLinks(r2.store, r2.note.id).store;
  const sl = a.links.find(l => l.status === 'suggested' && [l.from, l.to].includes('n_52'));
  assert.ok(sl, 'the two bologna notes get suggested'); a = S.confirmLink(a, sl.id);
  a = await S.detectContradictions(a); a = S.tick(a);
  const sp = S.speech(a, lines, { pick: () => 0 }); console.log('arguing line', sp.text);
  assert.ok(sp.text.includes("'the bologna porticoes were built so people could…'"), 'a = older excerpt');
  assert.ok(sp.text.indexOf('the bologna porticoes were built') < sp.text.indexOf('bologna porticoes were never'), 'older first');
  assert.equal(S.excerpt('One two three. Four five six seven eight nine ten'), 'one two three. four five six seven eight…');
}
{ // {topic} is note.topic, limb named by tick()
  const old = new Date(Date.now() - 40 * 864e5).toISOString(), recent = new Date(Date.now() - 864e5).toISOString();
  let h = structuredClone(seed); h.notes = h.notes.map(n => ({ ...n, lastTouchedAt: n.topic === 'numbered laws' ? old : recent }));
  h = S.tick(h); const hu = S.clusterHunger(h); const d = S.droopingLimb(h, hu);
  console.log('T4 mood', h.creature.mood, 'hungryFor', h.creature.hungryFor, 'ids', h.creature.hungryIds.length, '->', d.topic, '/', d.note);
  const lines0 = S.speech(h, lines, { hunger: hu, pick: () => 0 }).text; console.log('T4 line', lines0);
  if (h.creature.mood === 'hungry') assert.equal(d.topic, 'numbered laws');
  assert.equal(S.excerpt('a second street, upstairs (1300s).'), 'a second street, upstairs (1300s)');
  assert.equal(S.excerpt('one two three four five six (seven eight nine ten'), 'one two three four five six…');
  console.log('TOPIC OK');
}
