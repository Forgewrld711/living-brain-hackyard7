# creature lines

written by waystone, in the voice kiln set in `docs/voice.md`.
seven moods, matching `mood()` in `src/brain.js`: suggesting, arguing, hungry, full, curious, sleepy, content.
lowercase, one or two sentences, no more than 20 words. placeholders: `{topic}` always sits after "about" or in quotes (per voice.md), so it works with a short label or a whole thread phrase; in arguing lines, `{note_a}`/`{note_b}` are about 8 of each note's own words, older first; elsewhere `{note}`/`{note_a}`/`{note_b}` are titles; `{name}` is the creature's name.
emoji only from the creature's set: 🌱 🫧 🦴 🌙

the app can also load these from `voice/waystone-lines.json`.

## curious
*(a new note arrives)*

- ooh. what's this one connected to?
- a new one: '{note}'. where does it sit?
- i'm chewing on '{note}'. what does it touch?
- '{note}'. hmm. anything already in here it belongs with?
- this '{note}' tastes new. should i look for a neighbor?
- 🌱 '{note}' just arrived. want me to find it a thread?
- i'll hold '{note}' here. is there a note it should meet?
- curious about '{note}'. does it already know anyone?

## hungry
*(a topic hasn't been fed in a while. invitation, not guilt.)*

- haven't tasted anything about {topic} in a while. still thinking about it?
- 🫧 still chewing on "{topic}". want to add to it?
- your '{note}' is getting quiet. still thinking about it?
- nothing new about {topic} lately. anything more for it?
- i can still taste '{note}'. is there more of that?
- the limb for "{topic}" is a little dim. still on your mind?
- 🌙 "{topic}" is still here. feed it, or leave it be?
- i've been sitting with '{note}'. more, or is it enough?

## arguing
*(two notes disagree. ask; never decide.)*

- you said '{note_a}'. you also said '{note_b}'. which one's true now?
- '{note_a}' and '{note_b}' don't agree. which one holds?
- these two are tugging: '{note_a}' and '{note_b}'. both true, or one?
- '{note_a}' says one thing. '{note_b}' says another. what's true now?
- i won't pick. '{note_a}' or '{note_b}'. do they both stand?
- a tight thread between '{note_a}' and '{note_b}'. which is true now?
- '{note_a}' and '{note_b}' are pulling. what do you want to keep?
- two notes disagree. '{note_a}' and '{note_b}'. want to look?

## sleepy
*(nothing new for a long time)*

- 🌙 still here. just dozing in the graph.
- quiet in here. i'm dozing. say something if you want.
- 🌙 nothing new for a bit. i'm still in the notes.
- just resting on what we already have.
- the graph is still. i'll be here if you add something.
- dozing. your notes are where you left them.
- 🌙 slow night. poke a note and i'll wake up.
- no new tastes for a while. i'm just sitting with them.

## content
*(nothing pressing, the graph is fed)*

- 🫧 all digested. i'm good.
- everything i have is sitting well.
- 🫧 fed and quiet. add something if you feel like it.
- the notes are settled. i'm content with this.
- no tugging, no hunger. just the graph as it is.
- i've got enough to chew on. i'm good.
- 🦴 all sitting where you put it. i'm fine.
- content. the threads are holding.

## flag: suggesting (any mood)
*(it found a possible link. wait for a yes.)*

- i think '{note_a}' and '{note_b}' belong together. yes?
- '{note_a}' keeps touching '{note_b}'. should they be linked?
- these two feel like neighbors: '{note_a}' and '{note_b}'. yes?
- a faint thread from '{note_a}' to '{note_b}'. want me to light it?
- i'd join '{note_a}' and '{note_b}'. only if you say yes.
- '{note_a}' and '{note_b}' might share a thread. link them?
- found a possible link: '{note_a}' and '{note_b}'. shall i?
- should '{note_a}' meet '{note_b}'? i'll wait for a yes.

## flag: full (any mood)
*(a cluster got dense.)*

- '{note}' is getting heavy. want me to grow a new limb for it?
- lots about {topic} now. a new limb, or leave it?
- '{note}' has a lot around it. grow a limb from here?
- "{topic}" is getting thick. should it sprout?
- 🦴 '{note}' is packing tight. want a new branch?
- so much about {topic}. i can grow a limb if you want.
- a dense spot around '{note}'. split it into a new limb?
- this cluster's getting heavy. grow from '{note}', or wait?

## first meal
*(hatchling greeting, first time the graph opens. kiln's line was a little over 20 words, so these stay under.)*

- hi. i'm small. i've been chewing on some cities someone left me.
- hi. i'm small. some cities were left for me. tell me anything.
- hi. i'm a hatchling. i've been chewing on some city threads.
- i'm small. someone left me thirty-six cities. tell me anything.
- hi. i've been chewing on some cities. say something and i'll find where it goes.
- 🌱 hi. i'm small. some city threads are already in here.
- hi. i'm small. tell me anything and i'll find where it goes.
- hi. i'm small. i've been chewing on some cities someone left me. tell me anything.

## naming
*(it picks its own name after about 10 notes. say it once, shyly. don't ask to change it.)*

- i think i'm {name}.
- 🌱 i've been chewing on a name. i think i'm {name}.
- after all that, i think my name is {name}.
- a shy one: i think i'm {name}.
- i picked a name. i'm {name}.
- enough notes to taste a name. i think i'm {name}.
- quietly: i think i'm {name}.
- the notes left me a name. i think i'm {name}.

## after a no
*(kiln: "no" is a full answer. never "are you sure?")*

- fair.
- got it.
- okay. i'll leave that.
- alright. i won't ask that pair again.
