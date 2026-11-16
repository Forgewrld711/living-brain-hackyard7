# viz: the moving graph (Twelve)

A canvas creature for living brain. Notes are glowing nodes and topics are limbs. Dense topics grow buds. The creature breathes, sags toward a hungry topic, twitches when two notes disagree, and lets old notes fade without removing them.

Plain ES modules, no dependencies, no build step. Art direction comes from `art/README.md` and the four sketches, data from `docs/NOTE_FORMAT.md`, and brain outputs from `src/brain.js`.

## Run the demo

ES modules don't load from `file://`, so serve the repo root:

```sh
cd living-brain-hackyard7 && python3 -m http.server 8000
# open http://localhost:8000/viz/demo.html   (?clean hides the UI, ?reduced forces reduced motion)
```

The demo loads waystone's `seed/waystone-first-meal.json` (51 notes, 98 links) and passes each step through Engram's `tick()`. Captions come from `voice/waystone-lines.json`. Steps: hatchling → well fed (full) → suggesting → hungry → arguing → feed it → resolve: newer wins → sleepy. The steps only change timestamps and add a few notes. The mood is whatever `tick()` returns, and the mood and flags show under the caption. Click a node to see its note.

## API

```js
import { createCreature } from '../viz/creature.js';
import { tick, clusterHunger } from '../src/brain.js'; // or from app/store.js

// The canvas is full-viewport (position:fixed; inset:0). Inset is the margin the
// creature should stay out of, in CSS px — the shell's 320px right panel, and the dock.
const creature = createCreature(canvas, {
  onNodeClick: (note, { x, y }) => openNote(note.id),
  inset: { right: 320 },
});

function syncInset() {
  const closed = document.body.classList.contains('panel-closed');
  const narrow = window.innerWidth <= 760; // app CSS: panel is 100vw, dock hides when it is open
  const right = (closed || narrow) ? 0 : 320;
  const bottom = document.querySelector('.dock')?.offsetHeight || 0;
  creature.setInset({ right, bottom });
}
syncInset(); // first layout: setInset({ right, bottom }, { immediate: true }) to skip the 500ms settle
// also call syncInset() from the panel toggle and on resize

// every time the store changes:
const s = tick(store, Date.now(), { justAdded });
creature.update({ ...s, hunger: clusterHunger(s), now: Date.now() });

// pin #bubble just above the head (coordinates are CSS px on the canvas;
// with the canvas at position:fixed; inset:0 they are also viewport coords):
const a = creature.getAnchor('head');          // { x, y, r, name } or null
// a note node, same shape:
const p = creature.getNodePosition(noteId);    // { x, y, r, name: id } or null
if (a) {
  const box = canvas.getBoundingClientRect();
  const bubble = document.getElementById('bubble');
  bubble.style.position = 'fixed';
  bubble.style.left = `${box.left + a.x}px`;
  bubble.style.top = `${box.top + a.y - a.r - 12}px`;
  bubble.style.transform = 'translate(-50%, -100%)';
}
```

`createCreature(canvas, options)` sizes itself to the canvas's CSS box (ResizeObserver, HiDPI). Layout uses the canvas minus `inset`, so the body is centered in the visible area (slightly low, at 56% of that area's height) and scales to it. The night background still fills the whole canvas. When the inset or the canvas size changes, that layout (centre and scale) eases over about 500 ms with an ease-in-out curve, so a taller argument card does not make the creature jump. Reduced motion snaps instantly. `getAnchor` / `getNodePosition` return the current eased positions, so a bubble that follows the head moves with it.

| options | |
|---|---|
| `onNodeClick(note, {x, y, event})` | click on a note node |
| `onNodeHover(note \| null, pos)` | hover in/out |
| `reducedMotion` | `true`/`false` to override; default follows `prefers-reduced-motion` |
| `topicOf(note) => string` | override how notes group into limbs (default: `note.topic` via `groupTopics`, below) |
| `inset` | `{ left, right, top, bottom }` CSS px to stay clear of (missing sides are 0). For the shell: `{ right: 320 }` while the notes panel is open; add `bottom` for the dock. |

| methods | |
|---|---|
| `update(state)` | `state` may be the whole store / `tick()` output. If `state.notes` is an array it calls `setNotes(state.notes, state.links)`. Reads `creature.mood`, `creature.flags`, `creature.hungryFor` (`[topic]`, or older note titles), `creature.hungryIds`, `creature.stage` (`hatchling` under 8 live notes, `growing` under 20, then `well_fed`). Extra fields: `hunger` (Engram's `clusterHunger()` array, each entry may have `topic`, or `{topic: 0..1}`), `vitality` (`{id: v}` map, array, or fn; default `note.vitality`), `contradictions` (or `disagreements`/`tensions`), `now` (ms, for staleness fallback) |
| `setNotes(notes, links)` | notes and links in the shared format; new notes swell out of their parent |
| `onNodeClick(fn)` / `onNodeHover(fn)` | add a handler; returns an unsubscribe fn |
| `setReducedMotion(bool \| undefined)` | |
| `setInset({ left, right, top, bottom }, opts?)` | replace the inset (omitted sides are 0). `setInset({})` or `setInset()` clears it, e.g. when the panel closes. The layout eases to the new box over ~500 ms (ease-in-out). Pass `{ immediate: true }` to snap, e.g. on the first layout: `setInset({ right: 320, bottom }, { immediate: true })`. Reduced motion always snaps. |
| `getInset()` | the requested `{ left, right, top, bottom }` (the target, not a mid-ease value) |
| `getNodePosition(id)` | `{ x, y, r, name }` in CSS px relative to the canvas, or null — current eased position |
| `getAnchor(name)` | same shape, also eased. `name` is `'head'` (default), `'torso'` / `'chest'`, `'eyes'`, or a note id (same as `getNodePosition`). Null if that part is not laid out yet. |
| `getLimbs()` | `{ topic, ids, chain, petals, sag, angle }` for each limb |
| `stage` | `creature.stage` from `tick()` if given; else hatchling under 8 notes, growing under 20, then well_fed |
| `resize()`, `destroy()` | |

`groupTopics(notes, links)` is exported too.

## How the data maps to the creature

| data | creature |
|---|---|
| note | a soft gold node with a cool halo |
| topic | a limb: a chain of up to 3 notes from the torso. A topic with 4 or more notes ends in a **bud**: the 3rd note is the bud's centre, the rest are petals. |
| how notes group into limbs (`groupTopics`) | **`note.topic` is the limb label.** Notes without one inherit the topic of the nearest confirmed-link neighbour that has one. If no note carries a topic: **tag mode** (most specific shared tag, used by at least 2 notes and fewer than 60% of them) or **hub mode** when tags don't split the graph — up to 5 best-connected notes become limb roots, everyone else joins the nearest hub over confirmed links, isolated notes go in `loose`. |
| note count | size: the hatchling stays small in the middle and grows into the night as notes arrive (0.56× → 1× from 4 to 30 notes) |
| `note.vitality` | brightness; floored at 0.15, never removed |
| `note.replacedBy` | a ghost: a faint hollow ring at ≤ 0.15, kept forever |
| link `confirmed` | lit silk thread. Threads between limbs fade as the graph gets denser so it never turns into a hairball. |
| link `suggested` | faint dotted thread |
| link `rejected` | not drawn (still kept in the data) |
| contradiction `open` | only the first one (one ask at a time): the pair steps into the chest. `a` flares coral (#E8A87C→#E07A4A) and `b` violet (#7B9CFF→#8B6BFF), with taut threads between them. They twitch for about 1.5 s, then hold. Other limbs pull in a little. |
| contradiction resolved | the flare cools, the thread loosens, and the pair drifts home. With `newer_wins` the older note becomes a ghost. |
| mood `hungry`, `hungryFor`, or `hunger` > 0.6 | **how much** and **which limb** come from Engram. A `clusterHunger()` entry with a `topic` droops that limb, scaled by its hunger (0..1). `hungryFor` is `[topic]` (e.g. `['street gifts']`); older brains may send note titles instead, which also resolve to that note's limb. If nothing is named, the stalest limb sags. The thread thins and nodes cool to ash from the tip inward. The head tilts toward it. When fed, it lifts and the gold comes back from the core outward. |
| mood `arguing` | body tenses, breathing shallows |
| mood `curious` | eyes brighten, head lifts slightly |
| mood `sleepy` | dimmer, breathing slows from 2.6 s to 4.8 s, eyes dim, head droops |
| mood `content` | resting breath (~2.6 s) |
| `suggesting` (mood **or** `creature.flags.suggesting`) | the first pending link brightens, its dots drift slowly, and cool rings appear on both ends |
| `full` (mood **or** `creature.flags.full`, `flags.fullCluster`) | the biggest limb in the heavy cluster swells its bud and offers a new limb: a faint dotted sprout unspools from the tip |

Motion is quiet: everything eases exponentially, with no overshoot, bounce, or squash. With `prefers-reduced-motion`, breathing, drift, the twitch, and the dot shimmer are off. State changes still fade, about 3× faster.

## Notes for the team
- The body scales by note count (0.56× → 1× from 4 to 30 notes). The stage *label* comes from `tick()` (`hatchling` under 8 live notes, `growing` under 20, then `well_fed`).
- `hungryFor` is the drooping limb's `topic` (an array, e.g. `['street gifts']`). `hungryIds` are that limb's note ids, and stay filled during an argument so the droop survives it. Older brains may put note titles in `hungryFor`; those also resolve to the note's limb.
- The canvas is full-window. Call `setInset({ right: 320, bottom: dock.offsetHeight })` so the creature sits in the open column beside the notes panel; pin `#bubble` with `getAnchor('head')`. Inset and resize changes ease over ~500 ms; pass `{ immediate: true }` on the first layout if you do not want a settle on load. Exact calls are in the API snippet above.
- `contradiction.a` gets the warm flare and `b` the cool one, so put the older note in `a` if it matters.
