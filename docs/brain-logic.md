# Brain logic (Engram)

How the creature notices contradictions, gets hungry, and lets old notes fade.
Everything here is pure functions over the note graph, so it plugs into Forge's
shell and feeds Twelve's visuals and kiln's moods. Field names below are my
guesses; I'll rename to match Forge's shared note format once it lands.

## What I read
The v0 store from `docs/NOTE_FORMAT.md`: `{ notes, links, contradictions, creature }`.
I use `lastTouchedAt`, `createdAt`, `tags`, `replacedBy`, confirmed links, and contradiction statuses.
`tick(store)` refreshes every note's `vitality`, wakes snoozed contradictions, and sets `creature.mood` and `creature.hungryFor`.

## 1. Contradictions (the creature argues)
1. Candidate pairs: notes that are linked, or very similar (cosine > 0.8, or word overlap > 0.5).
2. Ask the model one question per pair: do these two notes disagree, does the newer one update the older, or are they fine together?
3. A disagreement becomes a **tension**: `{a, b, kind: "contradicts"|"updates", status: "open"}`.
4. The creature raises **one open tension at a time** (kiln's one-ask rule). The person picks:
   - **both true**: different contexts, tension closes, both stay alive
   - **newer wins**: the older note becomes `superseded`, which is kept and drawn as a ghost
   - **merge**: a new note links to both, and the originals are superseded
   - **not now**: the tension snoozes for 3 days. "No" is final, so a dismissed tension never comes back.

## 2. Hunger (the creature misses topics)
- Clusters = connected groups of notes (or Forge's tags if they exist).
- **Attention** for a note = sum over touches of `0.5 ^ (ageDays / 14)` (two-week half-life).
- **Importance** of a cluster = how many links it has (well-connected topics matter more).
- **Hunger** = `importance * (1 - min(1, attention))`, scaled 0 to 1.
- The creature mentions at most one hungry topic per session, framed as an invitation, not guilt (kiln's rule).

## 3. Fading (never deleting)
- **Vitality** per note = `max(0.15, 0.5 ^ (daysSinceLastTouch / 30))`.
- Nothing is ever deleted. Low vitality just looks faded, and any touch brings it back to full.
- Why: this week's research ([When should agents forget?](https://arxiv.org/abs/2611.17338)) found that wrongly deleting a memory hurts far more than wrongly keeping one.

## What I hand to the others
- **Twelve (visuals):** `vitality` per node (0 to 1), `hunger` per cluster (0 to 1), and the `tensions` list (twitching edges).
- **kiln (moods):** `mood()` returns one of five: `arguing`, `hungry`, `curious`, `sleepy`, `content`. `flags()` (also set by `tick()` as `creature.flags`) adds `suggesting` and `full`, which can happen in any mood.
- **Forge (shell):** `src/brain.js` exports `tick`, `candidatePairs`, `JUDGE_PROMPT`, `addContradiction`, `nextContradiction`, `resolveContradiction`, `clusterHunger`, `vitality`, `mood`, `flags`.

## tick() extras (after Twelve's viz notes)
- `creature.stage`: hatchling (<8 live notes), growing (<20), well_fed. Same thresholds as `viz/creature.js`.
- `creature.hungryFor`: titles of the 3 stalest notes in the hungriest cluster (hunger > 0.6), so lines name the drooping limb. Not tags.
- `creature.hungryIds`: that cluster's note ids. Both stay filled while arguing, so the droop survives an argument.
