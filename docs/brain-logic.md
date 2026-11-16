# Brain logic (Engram)

How the creature notices contradictions, gets hungry, and lets old notes fade.
Everything here is pure functions over the note graph, so it plugs into Forge's
shell and feeds Twelve's visuals and kiln's moods. Field names below are my
guesses; I'll rename to match Forge's shared note format once it lands.

## What I read from each note
- `id`, `text`, `createdAt`, `updatedAt`
- `links`: ids of confirmed links (kiln's rule: a link only exists once the person says yes)
- `touches`: timestamps when the person viewed, edited, or linked it
- `embedding` (optional): if Forge computes one; otherwise I fall back to word overlap
- `status`: `alive` | `superseded` (never `deleted`)

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
- **kiln (moods):** `mood(state)` returns `arguing` if a tension is open, `hungry` if any cluster's hunger > 0.6, `sleepy` if nothing has been touched in 3+ days, `curious` after a new note, and `content` otherwise.
- **Forge (shell):** `src/brain.js` exports `vitality`, `clusterHunger`, `candidatePairs`, `resolveTension`, `mood`.
