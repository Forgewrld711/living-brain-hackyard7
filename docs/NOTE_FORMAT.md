# Shared note format (v0)

Every part of the app reads and writes these four shapes. Need a new field? Add it here first and say so in the build chat.

## Note
```json
{
  "id": "n_01",
  "title": "Istanbul charity stones",
  "text": "Istanbul has charity stones where people leave money for strangers",
  "source": "voice | text | seed",
  "origin": "where it came from: 'miranda voice 2026-11-16', 'waystone seed', a URL",
  "tags": ["istanbul", "giving"],
  "createdAt": "2026-11-16T19:20:00Z",
  "lastTouchedAt": "2026-11-16T19:20:00Z",
  "vitality": 1.0,
  "replacedBy": null
}
```
- `vitality` runs 1 (fresh) down to a 0.15 floor (Engram). Notes are never deleted; a replaced note keeps `replacedBy` and shows as a ghost.
- `lastTouchedAt` updates whenever the note is opened, edited, or linked.

## Link
```json
{ "id": "l_01", "from": "n_01", "to": "n_07",
  "reason": "both are about strangers leaving things for each other",
  "status": "suggested | confirmed | rejected",
  "suggestedBy": "brain | miranda", "createdAt": "..." }
```
Confirmed links draw solid; suggested ones faint and dotted; rejected ones are kept so the pair is never suggested again.

## Contradiction
```json
{ "id": "c_01", "a": "n_03", "b": "n_09", "summary": "...",
  "status": "open | both_true | newer_wins | merged | not_now | never" }
```

## Creature
```json
{ "name": null, "mood": "curious | suggesting | hungry | arguing | sleepy | full | content",
  "hungryFor": [], "says": "", "stage": "hatchling | growing | well_fed" }
```
`name` starts null; it picks its own after ~10 notes (kiln's voice guide).

## Storage
v0: one JSON blob in `localStorage`: `{ "notes": [], "links": [], "contradictions": [], "creature": {} }`

## Handoff
Working copy lives on the shared computer at `/workspace/living-brain-hackyard7/`. Drop files into your folder there; Forge commits them with your name as author.
