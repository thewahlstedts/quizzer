# A game seats several Humans, and every Human action names its Contestant

To support playing with people in different places, the engine seats 1–3 Humans per game, with Bots filling the remaining seats (a game always has three Contestants). Every action other than `tick` carries `by`, the id of the Human taking it, and `step` ignores actions from an id that isn't a seated Human. Bots still act only through `tick`. A single-player game is the one-Human case: `newGame(bank, difficulty, rng, 'Name')` seats a Human with id `'human'`, as before, and the UI sends `by: 'human'`. We chose an explicit `by` on every action over defaulting to "the Human", so a future server can't accidentally apply one person's action as another's.

Rules for several Humans:

- Each Human may Ring In once per Clue. A Clue is revealed once someone answers it right, every Contestant has tried, or the window closes.
- Only the selecting Human may pick a Clue or Wager on a Daily Double. Only the chooser picks the Final Round Category.
- In the Final Round, each eligible Human Wagers once, and the Clue is read once all of them have.
- A Human may Override only their own Answer. Each Human has their own tally of correct and wrong Answers.
- Ties for lowest score (who picks first in Round 2, who chooses the Final Category) go to a Human over a Bot, and to a random one of the tied Humans.
- Any Human may `continue` past a reveal or Round intro.

## Consequences

`ContestantId` is a plain string. Bots are always `bot1`, `bot2`, so a Human may not use those ids. Anything that needs to know "is this a Bot?" asks the Contestant's `kind`, never its id. The UI, Game History and Stats still assume the device's Human has id `'human'`. A networked client will have to pass its own id through instead.

Still undecided, and needed before online play: whether Override should need another Human's agreement (today a Human can award themselves points); whether `continue` should wait for everyone or advance on a timer; and time limits for a Human's turn to pick a Clue, Wager or choose the Final Category, which have none today, so one idle player can stall the game.
