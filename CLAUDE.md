# Quizzer

Read `GLOSSARY.md` before naming anything — use its terms (Clue, not Question; Contestant/Human/Bot, not Player; Ring In, not Buzz). Decisions live in `docs/adr/`.

- Game rules belong in `src/engine/` as pure functions driven by timestamped actions (`step(state, action, rng)`); keep React out of it. Add/adjust Vitest tests there for any rule change.
- Clue banks are `src/content/level-N.json` plus any `level-N-<part>.json` batches (merged per Level in `src/content/index.ts`); `src/content/content.test.ts` validates them (unique names/ids, Rank 1–5 per Category, no Answer inside its Clue).
- `npm test && npm run build` must pass before pushing; pushing to `main` deploys.
