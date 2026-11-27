import type { GameState, HumanAction } from '../engine/game'
import type { ContestantId } from '../engine/types'
import { ClockSync } from './clock'
import type { ClientMessage, Lobby, RoomSettings, ServerMessage } from './protocol'

/** A connection to the server. WebSocket in the browser; an in-memory loopback in tests. */
export interface Transport {
  send(msg: ClientMessage): void
  close(): void
  onOpen(cb: () => void): void
  onMessage(cb: (msg: ServerMessage) => void): void
  onClose(cb: () => void): void
}

export interface ClientSnapshot {
  connected: boolean
  you?: ContestantId
  lobby?: Lobby
  /** Your view of the game, as the server last sent it. */
  view?: GameState
  error?: Extract<ServerMessage, { t: 'error' }>
}

/** Pings sent right after connecting (to sync the clock quickly), then one every PING_EVERY_MS. */
const FIRST_PINGS = 5
export const PING_EVERY_MS = 5_000

/**
 * One player's side of an online game. Joins (or rejoins with a saved token), keeps the latest
 * lobby and view, sends actions, and keeps a clock estimate so countdowns use server time.
 * Reconnecting is the owner's job: make a new Transport and a new client with `token`.
 */
export class RemoteClient {
  readonly clock = new ClockSync()
  private snap: ClientSnapshot = { connected: false }
  private listeners = new Set<(s: ClientSnapshot) => void>()
  private disconnectListeners = new Set<() => void>()
  private pingsSent = 0
  private token: string | undefined

  constructor(
    private readonly transport: Transport,
    join: { room: string; name: string; token?: string },
    private readonly now: () => number = Date.now,
  ) {
    this.token = join.token
    transport.onOpen(() => {
      this.transport.send({ t: 'hello', room: join.room, name: join.name, ...(this.token ? { token: this.token } : {}) })
      this.update({ connected: true })
    })
    transport.onMessage((m) => this.receive(m))
    transport.onClose(() => {
      this.update({ connected: false })
      for (const cb of this.disconnectListeners) cb()
    })
  }

  get snapshot(): ClientSnapshot {
    return this.snap
  }

  /** The token to rejoin with after a dropped connection; save it. */
  get rejoinToken(): string | undefined {
    return this.token
  }

  subscribe(cb: (s: ClientSnapshot) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  /** Called when the connection closes, whoever closed it. */
  onDisconnect(cb: () => void): () => void {
    this.disconnectListeners.add(cb)
    return () => this.disconnectListeners.delete(cb)
  }

  /** Close the connection but keep the seat (to reconnect elsewhere with the token). */
  leaveQuietly(): void {
    this.disconnectListeners.clear()
    this.transport.close()
  }

  act(action: HumanAction): void {
    this.transport.send({ t: 'act', action })
  }

  changeSettings(settings: RoomSettings): void {
    this.transport.send({ t: 'settings', settings })
  }

  start(): void {
    this.transport.send({ t: 'start' })
  }

  /** Host only: remove a member from the Room. */
  kick(id: ContestantId): void {
    this.transport.send({ t: 'kick', id })
  }

  /** Give up the seat for good, and close the connection. */
  leave(): void {
    this.disconnectListeners.clear()
    this.transport.send({ t: 'leave' })
    this.transport.close()
  }

  /** Call every second or so: sends a burst of pings at first, then one every PING_EVERY_MS. */
  pingIfDue(lastPingAt: number): number {
    const t = this.now()
    // Only once joined: before that the server answers pings with an error.
    if (!this.snap.connected || !this.snap.you) return lastPingAt
    if (this.pingsSent < FIRST_PINGS || t - lastPingAt >= PING_EVERY_MS) {
      this.transport.send({ t: 'ping', sent: t })
      this.pingsSent++
      return t
    }
    return lastPingAt
  }

  /** Server time now, by the clock estimate: pass this to the UI as `now`. */
  serverNow(): number {
    return this.clock.serverNow(this.now())
  }

  private receive(m: ServerMessage) {
    switch (m.t) {
      case 'welcome':
        this.token = m.token
        return this.update({ you: m.you, error: undefined })
      case 'lobby':
        return this.update({ lobby: m.lobby })
      case 'state':
        return this.update({ view: m.view })
      case 'pong':
        this.clock.add(m.sent, m.serverTime, this.now())
        return
      case 'error':
        return this.update({ error: m })
    }
  }

  private update(patch: Partial<ClientSnapshot>) {
    this.snap = { ...this.snap, ...patch }
    for (const cb of this.listeners) cb(this.snap)
  }
}

/** A Transport over a browser WebSocket, sending and receiving JSON. */
export function webSocketTransport(url: string): Transport {
  const ws = new WebSocket(url)
  return {
    send: (msg) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
    },
    close: () => ws.close(),
    onOpen: (cb) => ws.addEventListener('open', cb),
    onMessage: (cb) =>
      ws.addEventListener('message', (e) => {
        try {
          cb(JSON.parse(String(e.data)) as ServerMessage)
        } catch {
          // Ignore anything that isn't JSON; the server only sends JSON.
        }
      }),
    onClose: (cb) => ws.addEventListener('close', cb),
  }
}
