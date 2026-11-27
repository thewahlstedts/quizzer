import type { ContestantId } from '../engine/types'
import { parseClientMessage, type ServerMessage } from './protocol'
import { Room, type Outgoing, type RoomOptions } from './room'

/** One client connection, as the server sees it: something JSON text can be sent to. */
export interface Conn {
  send(text: string): void
}

export interface HubOptions extends RoomOptions {
  /** A fresh Room code; the Hub retries if it's taken. */
  makeCode: () => string
  /** Drop a Room once nobody has been connected for this long. */
  idleRoomMs?: number
}

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
  private readonly idleRoomMs: number

  constructor(private readonly opts: HubOptions) {
    this.idleRoomMs = opts.idleRoomMs ?? 30 * 60_000
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
      return this.deliver(at.room, at.room.handle(at.id, msg, now))
    }
    const code = msg.room.trim().toUpperCase()
    const room = code ? this.rooms.get(code) : this.newRoom()
    if (!room) return send(conn, { t: 'error', code: 'bad_message', message: `There's no room ${code}.` })
    const r = room.hello(msg, now)
    if (!r.id) {
      send(conn, r.error!)
      if (!code) this.rooms.delete(room.code) // a Room nobody got into
      return
    }
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
    for (const room of this.rooms.values()) {
      this.deliver(room, room.tick(now))
      if (!room.empty) continue
      const since = this.emptySince.get(room.code) ?? now
      this.emptySince.set(room.code, since)
      if (now - since >= this.idleRoomMs) {
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
