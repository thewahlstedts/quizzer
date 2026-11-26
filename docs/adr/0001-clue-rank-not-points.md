# Clues store a Rank, not a point value

Each Clue in the bank stores its Level and a Rank (1–5, easiest to hardest within that Level); its point value is derived at play time from Rank and Round (Round 1: Rank × 200, Round 2: Rank × 400). We chose this over storing point values on Clues so any Clue can appear in either Round or as a Final Round Clue (always Rank 5), which keeps the bank smaller for the same number of games and lets "too easy/too hard" Flags be fixed by re-ranking a Clue rather than rewriting it.

## Consequences

Changing the Board's value scheme (e.g. a third Round, or different values) is a code change, not a content migration. Conversely, "difficulty" in the bank is relative within a Level only — a Rank 5 at Level 1 is not comparable to a Rank 1 at Level 2.
