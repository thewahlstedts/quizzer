import type { ContestantId } from '../engine/types'
import { parseClientMessage, type ServerMessage } from './protocol'
import { Room, type Outgoing, type RoomOptions } from './room'

/** One client connection, as the server sees it: something JSON text can be sent to. */
export interface Conn {
  send(text: string): void
  /** The client's address, when the server knows it: used for per-address limits and removals. */
  ip?: string
}

export interface HubOptions extends RoomOptions {
  /** A fresh Room code; the Hub retries if it's taken. */
  makeCode: () => string
  /** Drop a Room whose game has started once nobody has been connected for this long. */
  idleRoomMs?: number
  /** Drop a Room that never started a game once nobody has been connected for this long. */
  idleLobbyMs?: number
  /** Refuse to create Rooms beyond this many (a started Room is ~100KB). */
  maxRooms?: number
  /** Rooms one address may create per minute. */
  roomsPerIpPerMinute?: number
  /** Joins of a Room that doesn't exist (code guessing) one address may make per minute. */
  failedJoinsPerIpPerMinute?: number
}

const MINUTE = 60_000

/**
 * Every Room on a server, and which connection is which member. Socket-library agnostic: the
 * server calls `message` with each text frame, `close` when a socket closes and `tick` about every
 * 100ms. A `hello` with an empty `room` creates a new Room.
 */
export class Hub {
  private rooms = new Map<string, Room>()
  private emptySince = new Map<string, number>()
  private seat = new Map<Conn, { room: Room; id: ContestantId }>()
  private conns = new Map<string, Conn>()
  /** Per address: when it recently created a Room, and when it recently failed to join one. */
  private created = new Map<string, number[]>()
  private failed = new Map<string, number[]>()
  private lastPrune = 0
  private readonly limits: Required<Omit<HubOptions, keyof RoomOptions | 'makeCode'>>

  constructor(private readonly opts: HubOptions) {
    this.limits = {
      idleRoomMs: opts.idleRoomMs ?? 30 * MINUTE,
      idleLobbyMs: opts.idleLobbyMs ?? 5 * MINUTE,
      maxRooms: opts.maxRooms ?? 500,
      roomsPerIpPerMinute: opts.roomsPerIpPerMinute ?? 10,
      failedJoinsPerIpPerMinute: opts.failedJoinsPerIpPerMinute ?? 20,
    }
  }

  get roomCount(): number {
    return this.rooms.size
  }

  message(conn: Conn, raw: string, now: number): void {
    const msg = parseClientMessage(raw)
    if (!msg) return send(conn, { t: 'error', code: 'bad_message', message: 'Unrecognized message.' })
    const at = this.seat.get(conn)
    if (msg.t !== 'hello' || at) {
      if (!at) return send(conn, { t: 'error', code: 'not_joined', message: 'Join a room first.' })
      this.deliver(at.room, at.room.handle(at.id, msg, now))
      return this.unseatGone(at.room)
    }
    const code = msg.room.trim().toUpperCase()
    const ip = conn.ip
    let room: Room | undefined
    if (code) {
      if (ip && recent(this.failed, ip, now) >= this.limits.failedJoinsPerIpPerMinute) {
        return send(conn, { t: 'error', code: 'slow_down', message: 'Too many tries. Wait a minute and try again.' })
      }
      room = this.rooms.get(code)
      if (!room) {
        if (ip) note(this.failed, ip, now)
        return send(conn, { t: 'error', code: 'no_room', message: `There's no room ${code}.` })
      }
    } else {
      if (ip && recent(this.created, ip, now) >= this.limits.roomsPerIpPerMinute) {
        return send(conn, { t: 'error', code: 'slow_down', message: 'Too many rooms created. Wait a minute and try again.' })
      }
      if (this.rooms.size >= this.limits.maxRooms) {
        return send(conn, { t: 'error', code: 'server_full', message: 'The game server is full right now. Try again later.' })
      }
      room = this.newRoom()
    }
    const r = room.hello(msg, now, ip)
    if (!r.id) {
      send(conn, r.error!)
      if (!code) this.rooms.delete(room.code) // a Room nobody got into
      else if (ip && r.error?.code === 'bad_token') note(this.failed, ip, now)
      return
    }
    if (!code && ip) note(this.created, ip, now)
    // A rejoin replaces any older socket still holding that seat.
    const key = `${room.code}:${r.id}`
    const old = this.conns.get(key)
    if (old && old !== conn) this.seat.delete(old)
    this.conns.set(key, conn)
    this.seat.set(conn, { room, id: r.id })
    this.emptySince.delete(room.code)
    this.deliver(room, r.out)
  }

  close(conn: Conn, now: number): void {
    const at = this.seat.get(conn)
    if (!at) return
    this.seat.delete(conn)
    const key = `${at.room.code}:${at.id}`
    if (this.conns.get(key) === conn) {
      this.conns.delete(key)
      this.deliver(at.room, at.room.disconnect(at.id, now))
    }
  }

  tick(now: number): void {
    if (now - this.lastPrune >= MINUTE) {
      this.lastPrune = now
      prune(this.created, now)
      prune(this.failed, now)
    }
    for (const room of this.rooms.values()) {
      this.deliver(room, room.tick(now))
      if (!room.empty) continue
      const since = this.emptySince.get(room.code) ?? now
      this.emptySince.set(room.code, since)
      if (now - since >= (room.state ? this.limits.idleRoomMs : this.limits.idleLobbyMs)) {
        this.rooms.delete(room.code)
        this.emptySince.delete(room.code)
      }
    }
  }

  private newRoom(): Room {
    let code = this.opts.makeCode()
    for (let i = 0; this.rooms.has(code) && i < 100; i++) code = this.opts.makeCode()
    const room = new Room(code, this.opts)
    this.rooms.set(code, room)
    return room
  }

  /** Forget the connections of anyone no longer in `room` (they left the lobby, or were removed). */
  private unseatGone(room: Room) {
    const prefix = `${room.code}:`
    for (const [key, conn] of this.conns) {
      if (!key.startsWith(prefix) || room.has(key.slice(prefix.length))) continue
      this.conns.delete(key)
      this.seat.delete(conn)
    }
  }

  private deliver(room: Room, out: Outgoing[]) {
    for (const { to, msg } of out) {
      const conn = this.conns.get(`${room.code}:${to}`)
      if (conn) send(conn, msg)
    }
  }
}

function send(conn: Conn, msg: ServerMessage) {
  conn.send(JSON.stringify(msg))
}

/** How many times `ip` is in `log` within the last minute. */
function recent(log: Map<string, number[]>, ip: string, now: number): number {
  return (log.get(ip) ?? []).filter((t) => now - t < MINUTE).length
}

function note(log: Map<string, number[]>, ip: string, now: number) {
  log.set(ip, [...(log.get(ip) ?? []).filter((t) => now - t < MINUTE), now])
}

function prune(log: Map<string, number[]>, now: number) {
  for (const [ip, times] of log) {
    const keep = times.filter((t) => now - t < MINUTE)
    if (keep.length) log.set(ip, keep)
    else log.delete(ip)
  }
}
