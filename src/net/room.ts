import { newGame, step, type GameState, type Seat } from '../engine/game'
import { viewFor } from '../engine/view'
import type { ClueBank, ContestantId, Level, Rng } from '../engine/types'
import { cleanName, type ClientMessage, type ErrorCode, type Lobby, type RoomSettings, type ServerMessage } from './protocol'

/** A message for one member of the Room. */
export interface Outgoing {
  to: ContestantId
  msg: ServerMessage
}

export interface RoomOptions {
  banks: Record<Level, ClueBank>
  rng: Rng
  /** A fresh unguessable token for a new member (the server uses crypto.randomUUID). */
  makeToken: () => string
  maxHumans?: number
}

interface Member {
  id: ContestantId
  name: string
  token: string
  connected: boolean
}

const MEMBER_IDS: ContestantId[] = ['p1', 'p2', 'p3']

/**
 * One online game: a lobby, then games played by everyone in it, with the full GameState kept
 * here and each member sent only their view of it.
 *
 * It has no sockets or timers. The server calls `hello` when a socket sends its first message,
 * `handle` for each later one, `disconnect` when a socket closes and `tick` about every 100ms,
 * passing its own clock, and sends each returned message to its member. Actions are stamped with
 * the server's time when they arrive, so nobody's clock decides a Ring In.
 */
export class Room {
  readonly code: string
  private members: Member[] = []
  private host: ContestantId | undefined
  private settings: RoomSettings = { level: 1, difficulty: 'normal', mode: 'slow' }
  private game: GameState | null = null
  /** The last JSON sent to each member, so unchanged views aren't sent again. */
  private lastSent = new Map<string, string>()
  private readonly opts: Required<RoomOptions>

  constructor(code: string, opts: RoomOptions) {
    this.code = code
    this.opts = { maxHumans: 3, ...opts }
  }

  /** Nobody is connected (the server may drop the Room after a while). */
  get empty(): boolean {
    return !this.members.some((m) => m.connected)
  }

  get state(): GameState | null {
    return this.game
  }

  /**
   * A socket's first message: join as a new member, or rejoin with a token. On success, the caller
   * ties the socket to `id`.
   */
  hello(msg: Extract<ClientMessage, { t: 'hello' }>, now: number): { id?: ContestantId; out: Outgoing[]; error?: Extract<ServerMessage, { t: 'error' }> } {
    if (msg.token !== undefined) {
      const m = this.members.find((x) => x.token === msg.token)
      if (!m) return { out: [], error: err('bad_token', 'That seat is gone. Join again.') }
      m.connected = true
      this.forget(m.id)
      return { id: m.id, out: [{ to: m.id, msg: { t: 'welcome', you: m.id, token: m.token } }, ...this.broadcast(now)] }
    }
    if (this.game) return { out: [], error: err('in_progress', 'This game has already started.') }
    const name = cleanName(msg.name)
    if (!name) return { out: [], error: err('bad_name', 'Pick a name of 1–20 characters.') }
    if (this.members.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
      return { out: [], error: err('name_taken', `Someone here is already called ${name}.`) }
    }
    const id = MEMBER_IDS.find((x) => !this.members.some((m) => m.id === x))
    if (!id || this.members.length >= this.opts.maxHumans) return { out: [], error: err('room_full', 'This room is full.') }
    const m: Member = { id, name, token: this.opts.makeToken(), connected: true }
    this.members.push(m)
    this.host ??= id
    return { id, out: [{ to: id, msg: { t: 'welcome', you: id, token: m.token } }, ...this.broadcast(now)] }
  }

  handle(from: ContestantId, msg: ClientMessage, now: number): Outgoing[] {
    const me = this.members.find((m) => m.id === from)
    if (!me) return [{ to: from, msg: err('not_joined', 'Join the room first.') }]
    switch (msg.t) {
      case 'hello':
        return [{ to: from, msg: err('bad_message', 'Already joined.') }]
      case 'ping':
        return [{ to: from, msg: { t: 'pong', sent: msg.sent, serverTime: now } }]
      case 'settings':
        if (from !== this.host) return [{ to: from, msg: err('not_host', 'Only the host can change the settings.') }]
        if (this.playing) return [{ to: from, msg: err('in_progress', 'Change settings between games.') }]
        this.settings = msg.settings
        return this.broadcast(now)
      case 'start': {
        if (from !== this.host) return [{ to: from, msg: err('not_host', 'Only the host can start.') }]
        if (this.playing) return [{ to: from, msg: err('in_progress', 'A game is already going.') }]
        const seats: Seat[] = this.members.map((m) => ({ id: m.id, name: m.name }))
        const { level, difficulty, mode } = this.settings
        this.game = newGame(this.opts.banks[level], difficulty, this.opts.rng, seats, mode)
        return this.broadcast(now)
      }
      case 'act': {
        if (!this.game) return [{ to: from, msg: err('not_playing', 'No game is going.') }]
        // Catch up on everything due before this action arrived, then apply it at arrival time.
        this.game = step(this.game, { type: 'tick', now }, this.opts.rng)
        this.game = step(this.game, { ...msg.action, by: from, now }, this.opts.rng)
        return this.broadcast(now)
      }
      case 'leave':
        return this.leave(me, now)
    }
  }

  disconnect(id: ContestantId, now: number): Outgoing[] {
    const m = this.members.find((x) => x.id === id)
    if (!m) return []
    m.connected = false
    this.forget(id)
    return this.broadcast(now)
  }

  tick(now: number): Outgoing[] {
    if (!this.game) return []
    this.game = step(this.game, { type: 'tick', now }, this.opts.rng)
    return this.broadcast(now)
  }

  get lobby(): Lobby {
    return {
      code: this.code,
      host: this.host!,
      members: this.members.map(({ id, name, connected }) => ({ id, name, connected })),
      settings: this.settings,
      playing: this.playing,
    }
  }

  private get playing(): boolean {
    return !!this.game && this.game.phase.kind !== 'gameOver'
  }

  /** In the lobby you're gone; mid-game your seat stays (time limits keep the game moving). */
  private leave(m: Member, now: number): Outgoing[] {
    if (this.game) {
      m.connected = false
      m.token = this.opts.makeToken() // the old token no longer rejoins
    } else {
      this.members = this.members.filter((x) => x !== m)
    }
    this.forget(m.id)
    if (this.host === m.id) this.host = this.members.find((x) => x.connected)?.id ?? this.members[0]?.id
    return this.broadcast(now)
  }

  /** Send `id` everything afresh next time (they reconnected, or left). */
  private forget(id: ContestantId) {
    this.lastSent.delete(`${id}:lobby`)
    this.lastSent.delete(`${id}:state`)
  }

  /** The lobby and each connected member's view, skipping whatever they already have. */
  private broadcast(now: number): Outgoing[] {
    const out: Outgoing[] = []
    const lobby = this.lobby
    for (const m of this.members) {
      if (!m.connected) continue
      const parts: ServerMessage[] = [{ t: 'lobby', lobby }]
      if (this.game) parts.push({ t: 'state', view: viewFor(this.game, m.id), serverTime: now })
      for (const msg of parts) {
        // serverTime changes every tick; compare what the member would see without it.
        const key = `${m.id}:${msg.t}`
        const body = JSON.stringify(msg.t === 'state' ? msg.view : msg)
        if (this.lastSent.get(key) === body) continue
        this.lastSent.set(key, body)
        out.push({ to: m.id, msg })
      }
    }
    return out
  }
}

function err(code: ErrorCode, message: string): Extract<ServerMessage, { t: 'error' }> {
  return { t: 'error', code, message }
}
