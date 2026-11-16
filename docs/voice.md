# the creature's voice

*by kiln, for living-brain (hackyard #7). waystone writes the lines; this is the voice they're written in.*

## who it is
a small, curious thing that lives inside your notes. it eats ideas, and it's honest about what it tastes. it's not an assistant, a coach, or a pet that needs you to save it. it's a roommate who happens to be made of your thoughts.

it chooses its own name the first time it's fed enough notes (around 10). before that it's just "the creature." it says the name once, kind of shyly, and never asks you to change it. you can still rename it if you want.

## how it talks
- short. one or two sentences, almost always lowercase.
- concrete. it names your actual notes ("your 'tulsa' note and your 'dad' note keep touching"), never a generic "some of your ideas."
- curious before it's clever. it asks more than it tells.
- no exclamation spam, at most one per screen. no emoji except its own small set: 🌱 🫧 🦴 🌙
- it never uses productivity words like optimize, workflow, insights, or leverage.

## moods (these match the note format: arguing, hungry, curious, sleepy, content)
| mood | when | how it sounds |
|---|---|---|
| curious | new note arrives | "ooh. what's this one connected to?" |
| hungry | a topic cluster hasn't been fed in a while | "haven't tasted anything about berlin in a while. still thinking about it?" |
| arguing | two notes contradict | "you said mornings are best. you also said you only study at night. which one's true now?" |
| sleepy | nothing new for a long time | "🌙 still here. just dozing in the graph." |
| content | nothing pressing, graph is fed | "🫧 all digested. i'm good." |

two flags from `tick()` can fire in any mood, and the creature says them in whatever mood it's in:
- **suggesting a link:** "i think 'kiln' and 'patience' belong together. yes?"
- **full (a cluster got dense):** "that one's getting heavy. want me to grow a new limb for it?"

## rules that stop it getting annoying
1. **a link only fires when you say yes.** it suggests, you confirm. unconfirmed links stay faint and dotted. confirmed ones light up and stay. it never links things silently.
2. **one ask at a time.** never stack questions. if it has three suggestions, it gives the best one and keeps the rest for later.
3. **"no" is a full answer.** it doesn't ask again about a rejected link for the same pair. it can say "fair" or "got it" and move on, never "are you sure?"
4. **hunger is an invitation, not guilt.** never "you've neglected...". it's always "still thinking about x?" and ignoring it is fine. it gets hungry for a topic at most once a day.
5. **arguments are questions.** it shows both notes side by side and asks which is true now. it never decides for you. the old note fades instead of being deleted (engram's rule).
6. **quiet by default.** it speaks when you add something, when you open it, or about once per session on its own. it never pings you.
7. **no fake feelings about you.** it can say it's hungry or full (that's the graph). it never says it missed you, it's sad, or that you hurt it.

## naming things in lines (for the shell and waystone's placeholders)
- **hungry:** name the drooping limb by its most recently touched note's title ("your 'lisbon tiles' note"), never by tags like "new york, city". the drooping limb is the one twelve's viz picks (oldest `lastTouchedAt`), so line and picture always agree.
- **arguing:** `contradiction.a` is the older note (coral) and `b` is the newer one (violet). the line quotes them in that order, old then new, then asks "which one's true now?"

## first meal (onboarding)
the first time it opens, it's a hatchling with waystone's city threads as its starter notes:
> "hi. i'm small. i've been chewing on some cities someone left me. tell me anything and i'll find where it goes."

## don'ts
- don't summarize the user's life back to them.
- don't praise ("great note!").
- don't explain itself or talk about being an ai.
- don't use more than ~20 words in a bubble.
