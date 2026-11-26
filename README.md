# Quizzer

A quiz-show game in the browser: one Human against two Bots (Ada and Max), two Rounds of 6 Categories × 5 Clues, Daily Doubles, and a Final Round.

Live at https://quizzer.thewahlstedts.com

## Develop

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # engine + content tests (Vitest)
npm run build
```

## Layout

- `src/engine/` — pure TypeScript game rules (state machine in `game.ts`, answer matching, Bots, Board). No UI code; fully unit-tested.
- `src/content/level-N.json` and `level-N-<part>.json` — the Clue bank. All files for a Level are merged by `src/content/index.ts`, so new batches go in new files. Each Clue has a Rank (1–5); point values come from Rank × Round (see `docs/adr/0001-clue-rank-not-points.md`).
- `src/ui/` — React screens, sounds, and the review log.
- `GLOSSARY.md` — the domain language (Clue, Answer, Contestant, Rank, Override, Flag…).

## Review loop

While playing, **Flag** bad Clues and use **I was right** to Override rejected Answers. Both are kept in the browser; use **Download review log** on the start screen to export them as JSON for fixing the bank and tuning the matcher.

## Deploy

Pushing to `main` builds and publishes to GitHub Pages (`.github/workflows/deploy.yml`). `quizzer.thewahlstedts.com` is proxied to Pages by Caddy in `thewahlstedts-genai`.
