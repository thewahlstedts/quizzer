# Quizzer

A Jeopardy-style quiz game where Humans play against Bots across a board of Categories. Every game has three seats; today the app seats one Human and two Bots.

## Contestants

**Contestant**:
Anyone competing in a game — either a Human or a Bot.
_Avoid_: Player, participant

**Human**:
A real person playing. A game seats 1–3 Humans and fills the remaining seats with Bots.
_Avoid_: User, player one

**Bot**:
A computer-controlled Contestant.
_Avoid_: AI, CPU, computer player, NPC

**Bot Difficulty**:
How strong the Bots are in a game (Easy, Normal, Hard), chosen independently of Level.
_Avoid_: Bot level, AI skill

## Content

**Clue**:
The prompt shown to Contestants, belonging to one Category, one Level, and one Rank.
_Avoid_: Question, prompt

**Answer**:
What a Contestant types in reply to a Clue. A Clue has one canonical Answer plus accepted alternates.
_Avoid_: Response, guess

**Rank**:
A Clue's difficulty within its Level, 1 (easiest) to 5 (hardest). Point value is derived from Rank and Round, never stored on the Clue.
_Avoid_: Value, row, points

**Category**:
A themed column of Clues on the Board.
_Avoid_: Topic, subject

**Level**:
A difficulty tier (1–4) of Clues; one Level is used for a whole game. Not tied to age.
_Avoid_: Age group, grade, tier

## Play

**Board**:
The grid of Categories and point values from which Clues are selected.
_Avoid_: Grid, game board

**Ring In**:
A Contestant claiming the right to Answer the current Clue.
_Avoid_: Buzz, buzz in

**Mode**:
How a game paces Ring In, chosen at setup. **Slow**: 10 seconds to read a Clue, then 30 seconds to Ring In. **Medium**: 5 seconds to read, then 20 seconds. **Fast**: 2 seconds to read, then 15 seconds. **Instant**: Ring In as soon as the Clue appears, within 15 seconds. Daily Doubles and the Final Round play the same in every Mode. (Slow was once called Classic; Quick, which had no wait, became Fast.)
_Avoid_: Speed, game type

**Round**:
One full Board of play. A game has Round 1, Round 2, then the Final Round.

**Wager**:
The amount a Contestant risks on a Daily Double or the Final Round instead of a face value.
_Avoid_: Bet, stake

**Daily Double**:
A hidden Clue on the Board that only the selecting Contestant answers, for a wager instead of the face value.

**Final Round**:
The closing Clue, answered by all Contestants with wagers, from a Category the last-place Contestant chooses among three offered.
_Avoid_: Final Jeopardy

**Masked Answer**:
What is shown when a Bot answers wrong: asterisks matching the correct Answer's character count, with spaces placed at random. A correct Bot shows its Answer.

## Stats

**Earnings**:
The Human's final score in a game (can be negative). Stats add them up for Today, This week (from Sunday), This month and All time.
_Avoid_: Winnings, money, total

**Game History**:
The finished games kept in this browser for the Human to review: when, Level, Bot Difficulty, Mode, every Contestant's final score, the Human's place, Earnings and correct/wrong Answers. Quit games aren't recorded.
_Avoid_: Log, past games

## Review

**Override**:
A Human declaring their own rejected Answer correct ("I was right"). With other Humans in the game, it needs every one of them to agree. Overrides are kept as evidence for improving judging.
_Avoid_: Appeal, dispute, challenge

**Flag**:
The Human marking a Clue as bad so it can be reviewed later.
_Avoid_: Report, mark
