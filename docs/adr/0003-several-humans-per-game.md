# A game seats several Humans, and every Human action names its Contestant

To support playing with people in different places, the engine seats 1–3 Humans per game, with Bots filling the remaining seats (a game always has three Contestants). Every action other than `tick` carries `by`, the id of the Human taking it, and `step` ignores actions from an id that isn't a seated Human. Bots still act only through `tick`. A single-player game is the one-Human case: `newGame(bank, difficulty, rng, 'Name')` seats a Human with id `'human'`, as before, and the UI sends `by: 'human'`. We chose an explicit `by` on every action over defaulting to "the Human", so a future server can't accidentally apply one person's action as another's.

Rules for several Humans:

- Each Human may Ring In once per Clue. A Clue is revealed once someone answers it right, every Contestant has tried, or the window closes.
- Only the selecting Human may pick a Clue or Wager on a Daily Double. Only the chooser picks the Final Round Category.
- In the Final Round, each eligible Human Wagers once, and the Clue is read once all of them have. Bots still thinking hurry (within `finalRushMs`) only once every eligible Human has answered.
- A Human may Override only their own Answer, and with other Humans in the game every one of them must agree: one "no", or no full agreement within 20 seconds, turns it down for good. Bots don't vote. Each Human has their own tally of correct and wrong Answers.
- Ties for lowest score (who picks first in Round 2, who chooses the Final Category) go to a Human over a Bot, and to a random one of the tied Humans.
- A reveal, Round intro or Final reveal moves on once every Human has pressed Continue, and not while an Override vote is open.
- With several Humans, a Human's turn has a time limit (`TURN_LIMITS`): 20 seconds to pick a Clue or the Final Category (then one is picked at random), 30 seconds to Wager (then the minimum: $5 on a Daily Double, $0 in the Final), and 30 seconds for everyone to press Continue (then the game moves on). A single-player game has no time limits, as before.

## Consequences

`ContestantId` is a plain string. Bots are always `bot1`, `bot2`, so a Human may not use those ids. Anything that needs to know "is this a Bot?" asks the Contestant's `kind`, never its id. The UI, Game History and Stats still assume the device's Human has id `'human'`. A networked client will have to pass its own id through instead.

The Continue time limit means "wait for everyone" can't be stalled by one player who walked away; the cost is that someone slow to read a reveal gets moved on after 30 seconds.

## What each player sees

`viewFor(state, id)` (`src/engine/view.ts`) is what a server sends each Human instead of the full state. It has the same shape as `GameState`, with these hidden: unpicked Clues (text, Answer, Daily Double), Round 2's Board, a Clue's Answer until its reveal, a Daily Double's Clue until it's wagered on, the Final Clue until it's read and its Answer until the reveal, other Contestants' Final Wagers and Answers until the reveal, and the Bots' plans (`botKnows`, ring and answer times).

This only keeps the Answers secret if the client doesn't have them some other way. Today the build ships every Level's Clue bank in the one JavaScript bundle, so anyone can look up a shown Clue's Answer there. The online client must load Clues only from the server, and the bank must be left out of its bundle, for example by splitting the single-player game into its own chunk. That needs the service worker's precache to learn about lazily loaded chunks (see ADR 0002).
