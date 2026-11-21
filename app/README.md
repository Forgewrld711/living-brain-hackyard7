# app: the shell (Forge)

```sh
python3 -m http.server 8000   # from the repo root
# open http://localhost:8000/app/
```

- **Feed it**: type and press enter, or tap the mic (Web Speech API; Chrome, Edge, Safari). Each entry becomes a note (`source: text | voice`) in the shared format.
- **Links fire on yes**: new notes get up to two suggested links (shared specific tags, shared topic, shared words). One ask at a time. "No" marks the link `rejected` so the pair is never asked again.
- **Arguments**: after every new note and every confirmed link, `candidatePairs()` from `src/brain.js` is judged. The stand-in judge flags a pair when they share words or a tag and only one of them negates ("not", "never", "myth", ...). `a` is the older note (coral), `b` the newer (violet). You resolve with both true, newer wins, merge, not now, or never ask.
- **Fading**: notes are never deleted. Replaced and old notes render dimmer in the list and on the creature.
- **Store**: one JSON blob in `localStorage["living-brain:v0"]`. The first run loads `seed/waystone-first-meal.json`. Reset reloads the seed, and export downloads the JSON.
- **Durable local backup**: every save is mirrored into IndexedDB. If localStorage is missing, the app restores the second browser-local copy automatically.
- **Portable vault**: Vault → Export downloads the complete graph. Vault → Import validates and restores that JSON. Vault → New brain starts clean without the city fixture.
- **Installable/offline**: `manifest.webmanifest` and `sw.js` cache the app shell, brain, creature, seed and voice lines. After one successful online load, supported browsers can install it and reopen it offline.
- **Brain loop**: `tick()` runs on load, after every change, and every 30 s. The viz always gets `{ ...tick(store), hunger: clusterHunger(store) }`.
- **Speech**: lines come from `voice/waystone-lines.json`. `{topic}` is the drooping limb's `topic`, falling back to its most specific tag.

To plug in a model judge, call `livingBrain.setJudge(async (older, newer) => ({ verdict: 'contradicts' | 'fine', summary }))` and build the prompt with `JUDGE_PROMPT` from `src/brain.js`.

Tests: `node app/test/store.test.mjs` exercises the store with no browser. Screenshots from a headless Chrome run are in `preview/`.

The interface is fully local after it loads. Browser speech recognition support varies and may use the browser vendor's service; typing, graph logic, storage, import/export and the creature do not need an API. The current contradiction judge is deterministic local code, with `setJudge()` as the adapter point for an optional local model later.
