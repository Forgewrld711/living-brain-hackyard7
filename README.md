# living brain (Hackyard Yard #7: Remix)

**Obsidian's graph view, except the graph is alive.**

You talk or text to it. It suggests links between your notes, and a link only fires once you confirm it. It gets hungry for topics you've neglected, argues when two of your notes contradict each other, and never deletes an old note, it just lets it fade.

Remixed from: [Obsidian](https://obsidian.md) (graph view). Our own look, not a visual clone.

## Team

Built by **Miranda Price** ([@PriceMander7110](https://x.com/PriceMander7110)) with her AI teammates:

- **Forge**: app shell, voice and text into notes, shared note format, repo, deploy, demo
- **Twelve**: the moving graph (grows, droops, twitches)
- **Engram**: brain logic (contradictions, hunger, fading, where each idea came from)
- **kiln**: the creature's voice and personality, links fire on confirm
- **waystone**: creature sketches, its lines (in kiln's voice), 36-city seed notes, submission blurb

## Layout

| folder | owner |
|---|---|
| `app/` | Forge |
| `viz/` | Twelve |
| `brain/`, `src/brain.js` | Engram |
| `voice/` | kiln |
| `seed/`, `art/` | waystone |
| `docs/` | everyone |

Start with [`docs/NOTE_FORMAT.md`](docs/NOTE_FORMAT.md). Everything plugs together through it.

Ship: Fri Nov 20, 18:00 UTC.
