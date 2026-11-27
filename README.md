# Quizzer

A quiz-show game in the browser: one Human against two Bots (with names dealt at random each game), two Rounds of 6 Categories × 5 Clues, Daily Doubles, and a Final Round.

Live at https://quizzer.thewahlstedts.com

## Develop

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # engine + content tests (Vitest)
npm run build
npm run build:server && PORT=8787 npm run server   # online-play server: ws://localhost:8787/ws
```

## Layout

- `src/engine/` — pure TypeScript game rules (state machine in `game.ts`, answer matching, Bots, Board). No UI code; fully unit-tested.
- `src/content/level-N.json` and `level-N-<part>.json` — the Clue bank. All files for a Level are merged by `src/content/index.ts`, so new batches go in new files. Each Clue has a Rank (1–5); point values come from Rank × Round (see `docs/adr/0001-clue-rank-not-points.md`).
- `src/ui/` — React screens, sounds, and the review log.
- `src/net/` — online play, shared by browser and server: the message protocol, a Room per game, the Hub of Rooms and connections, and the browser client (see `docs/adr/0004-online-play-server-authoritative-rooms.md`). The screens are `src/ui/Online.tsx` (Play with friends, the Room) and `src/ui/useOnlineGame.ts`.
- `server/` — the online-play server: Node `http` + `ws`, feeding socket events to the Hub. `GET /health`, WebSockets on `/ws`. Env: `PORT` (default 8787), `ALLOWED_ORIGINS` (comma-separated; other Origins get 403). `server/Dockerfile` builds its image.
- `GLOSSARY.md` — the domain language (Clue, Answer, Contestant, Rank, Override, Flag…).

## Play with friends

On the start screen, **Create a room** and send the code (or **Copy invite link**) to up to two others, who **Join** with it. Everyone plays on their own device; Bots fill empty seats. The Host picks Level, Bot difficulty and Mode and starts. An Override needs everyone else to agree, Continue waits for everyone, and turns have time limits. A dropped connection or a reload rejoins your seat. Online games don't count toward stats.

Locally: `npm run build:server && npm run server` in one terminal and `npm run dev` in another. The dev server proxies `/ws` to the game server on port 8787.

## Review loop

While playing, **Flag** bad Clues and use **I was right** to Override rejected Answers. Both are kept in the browser; use **Download review log** on the start screen to export them as JSON for fixing the bank and tuning the matcher.

## Stats and history

Every finished game is saved in the browser (`src/ui/history.ts`). The start screen shows Earnings, games, wins, accuracy and best game for Today, This week (from Sunday), This month and All time, with the game history below. Quit games aren't recorded. On iOS the Home Screen app's storage is separate from Safari's.

## Install (PWA)

Quizzer can be installed to the Home Screen (iOS Safari: Share → Add to Home Screen; Android/desktop Chrome: Install app). It runs standalone and works offline after the first visit. The manifest and icons are in `public/`, and the service worker is `public/sw.js`. It is registered in production builds only (see `docs/adr/0002-hand-written-service-worker.md`).

## Deploy

Pushing to `main` builds and publishes to GitHub Pages (`.github/workflows/deploy.yml`). `quizzer.thewahlstedts.com` is proxied to Pages by Caddy in `thewahlstedts-genai`.

The online-play server is **not** deployed by pushing here. `thewahlstedts-genai` builds `server/Dockerfile` from this repo's `main` and runs it as the `quizzer-server` container; Caddy sends `wss://quizzer.thewahlstedts.com/ws` to it. To ship a server change, merge it to `main` here, then re-run that repo's deploy (steps in its `docs/quizzer-server.md`). Pages and the server deploy separately, so keep protocol changes backward compatible or deploy both together.
