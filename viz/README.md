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
import { createCreature } from './viz/creature.js';
import { tick, clusterHunger } from './src/brain.js';

const creature = createCreature(canvas, { onNodeClick: (note, { x, y }) => openNote(note) });

// every time the store changes:
const s = tick(store, Date.now(), { justAdded });
creature.update({ ...s, hunger: clusterHunger(s) });   // notes, links, contradictions, creature, hunger
```

`createCreature(canvas, options)` sizes itself to the canvas's CSS box (ResizeObserver, HiDPI).

| options | |
|---|---|
| `onNodeClick(note, {x, y, event})` | click on a note node |
| `onNodeHover(note \| null, pos)` | hover in/out |
| `reducedMotion` | `true`/`false` to override; default follows `prefers-reduced-motion` |
| `topicOf(note) => string` | override how notes group into limbs (default: `groupTopics`, below) |

| methods | |
|---|---|
| `update(state)` | `state` may be the whole store / `tick()` output. If `state.notes` is an array it calls `setNotes(state.notes, state.links)`. Reads `creature.mood`, `creature.flags`, `creature.hungryFor`. Extra fields: `hunger` (Engram's `clusterHunger()` array, or `{topic: 0..1}`), `vitality` (`{id: v}` map, array, or fn; default `note.vitality`), `contradictions` (or `disagreements`/`tensions`), `now` (ms, for staleness) |
| `setNotes(notes, links)` | notes and links in the shared format; new notes swell out of their parent |
| `onNodeClick(fn)` / `onNodeHover(fn)` | add a handler; returns an unsubscribe fn |
| `setReducedMotion(bool \| undefined)` | |
| `getNodePosition(id)` | `{x, y, r}` in CSS px (to anchor a speech bubble), or null |
| `stage` | `creature.stage` if given, else from note count |
| `resize()`, `destroy()` | |

`groupTopics(notes, links)` is exported too.

## How the data maps to the creature

| data | creature |
|---|---|
| note | a soft gold node with a cool halo |
| topic | a limb: a chain of up to 3 notes from the torso. A topic with 4 or more notes ends in a **bud**: the 3rd note is the bud's centre, the rest are petals. |
| how notes group into limbs (`groupTopics`) | **Tag mode**: each note's most specific shared tag (used by at least 2 notes and fewer than 60% of them). **Hub mode**: used when tags don't split the graph, as in the seed, where every city has its own tag plus `city`. Up to 5 best-connected notes become limb roots, every note joins its nearest hub over confirmed links, and unreached link-components get their own limb. Isolated notes go in `loose`. |
| note count | size: the hatchling stays small in the middle and grows into the night as notes arrive (0.56× → 1× from 4 to 30 notes) |
| `note.vitality` | brightness; floored at 0.15, never removed |
| `note.replacedBy` | a ghost: a faint hollow ring at ≤ 0.15, kept forever |
| link `confirmed` | lit silk thread. Threads between limbs fade as the graph gets denser so it never turns into a hairball. |
| link `suggested` | faint dotted thread |
| link `rejected` | not drawn (still kept in the data) |
| contradiction `open` | only the first one (one ask at a time): the pair steps into the chest. `a` flares coral (#E8A87C→#E07A4A) and `b` violet (#7B9CFF→#8B6BFF), with taut threads between them. They twitch for about 1.5 s, then hold. Other limbs pull in a little. |
| contradiction resolved | the flare cools, the thread loosens, and the pair drifts home. With `newer_wins` the older note becomes a ghost. |
| mood `hungry`, `hungryFor`, or `hunger` > 0.6 | **how much** comes from Engram. **Where** is the limb whose notes have the oldest `lastTouchedAt`. That limb sags under gravity, its thread thins, and its nodes cool to ash from the tip inward. The head tilts toward it. When fed, it lifts and the gold comes back from the core outward. |
| mood `arguing` | body tenses, breathing shallows |
| mood `curious` | eyes brighten, head lifts slightly |
| mood `sleepy` | dimmer, breathing slows from 2.6 s to 4.8 s, eyes dim, head droops |
| mood `content` | resting breath (~2.6 s) |
| `suggesting` (mood **or** `creature.flags.suggesting`) | the first pending link brightens, its dots drift slowly, and cool rings appear on both ends |
| `full` (mood **or** `creature.flags.full`, `flags.fullCluster`) | the biggest limb in the heavy cluster swells its bud and offers a new limb: a faint dotted sprout unspools from the tip |

Motion is quiet: everything eases exponentially, with no overshoot, bounce, or squash. With `prefers-reduced-motion`, breathing, drift, the twitch, and the dot shimmer are off. State changes still fade, about 3× faster.

## Notes for the team
- `tick()` passes `creature.stage` through unchanged, so the seed's `hatchling` would stick forever. The viz sizes by note count instead. The demo sets the stage by count.
- `hungryFor` holds the top cluster's tags. In the seed that's one 45-note cluster, so the tags are things like `new york, city`. The viz uses staleness to pick which limb to droop. The app should name that limb, not `hungryFor[0]`.
- `contradiction.a` gets the warm flare and `b` the cool one, so put the older note in `a` if it matters.
