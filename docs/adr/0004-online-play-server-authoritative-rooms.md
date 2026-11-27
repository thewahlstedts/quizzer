# Online play: the server runs each game, and players send actions over WebSockets

For people in different places, a server keeps each game's full `GameState` and runs the same engine (`step`) the single-player app runs locally. Each player's browser sends their actions and receives only their view of the game (`viewFor`, ADR 0003). We chose this over letting one player's browser host the game. With a browser host, the host's actions arrive instantly while everyone else's are 50–300ms late, so the host wins close Ring Ins. The host would also hold every Answer, and the game would end whenever the host's phone put the tab to sleep.

The shared code is in `src/net/`, with no sockets or timers in it:

- `protocol.ts`: the JSON messages, and `parseClientMessage`, which turns anything not exactly a known message into `null`. The server never passes untrusted JSON to the engine.
- `room.ts`: one game's lobby (up to three members, the first is the Host, who sets Level, Bot Difficulty and Mode and starts), its games, and rematches. It sends each member the lobby and their view only when either has changed.
- `hub.ts`: every Room on a server and which connection holds which seat. A `hello` with an empty room code creates a Room. Rejoining with your token takes your seat back from any older connection. Rooms nobody has been connected to for 30 minutes are dropped. The server process only feeds it socket events and calls `tick` about every 100ms.
- `clock.ts` and `client.ts`: the browser side. It estimates the server's clock from ping round trips, so countdowns, which carry server timestamps, are right on every device.

Actions are stamped with the server's clock when they arrive. Before applying an action, the Room first processes everything that was due by then, such as a Bot's Ring In or a deadline. Dropping the connection keeps your seat, and the turn time limits keep the game moving without you. Leaving for good mid-game gives up your token.

## Consequences

Ring In is decided by when actions reach the server. A player with a slower connection is behind by their one-way latency, usually tens of milliseconds. Correcting for each player's measured latency is possible later, but it isn't done, because doing it fairly would mean rewinding Bot Ring Ins the server has already processed.

The view only hides Answers if the online client doesn't ship the Clue bank, which the current bundle does (ADR 0003).

Online play needs a running server, which GitHub Pages can't be. The server is a separate deployment that serves WebSockets on the same domain. Online games don't yet count toward Earnings or Game History.
