import { describe, expect, it } from 'vitest'
import { currentCell, TIMING, TURN_LIMITS, type GameState } from '../engine/game'
import { seeded } from '../engine/rng'
import { BANKS } from '../content'
import { ClockSync } from './clock'
import { RemoteClient, type Transport } from './client'
import { Hub, type Conn } from './hub'
import { parseClientMessage, type ClientMessage, type ServerMessage } from './protocol'

// ---------- protocol ----------

describe('parseClientMessage', () => {
  const ok = (m: unknown) => parseClientMessage(JSON.stringify(m))

  it('accepts each well-formed message', () => {
    const msgs: ClientMessage[] = [
      { t: 'hello', room: 'ABCD', name: 'Ann' },
      { t: 'hello', room: '', name: 'Ann', token: 't' },
      { t: 'settings', settings: { level: 2, difficulty: 'hard', mode: 'fast' } },
      { t: 'start' },
      { t: 'leave' },
      { t: 'ping', sent: 123 },
      { t: 'act', action: { type: 'select', ref: { col: 1, row: 2 } } },
      { t: 'act', action: { type: 'ringIn' } },
      { t: 'act', action: { type: 'submitAnswer', text: '' } },
      { t: 'act', action: { type: 'ddWager', amount: 500 } },
      { t: 'act', action: { type: 'finalChoose', categoryId: 'x' } },
      { t: 'act', action: { type: 'finalWager', amount: 0 } },
      { t: 'act', action: { type: 'continue' } },
      { t: 'act', action: { type: 'override' } },
      { t: 'act', action: { type: 'vote', agree: false } },
    ]
    for (const m of msgs) expect(ok(m)).toEqual(m)
  })

  it('drops extra fields, so nothing unexpected reaches the engine', () => {
    expect(ok({ t: 'act', action: { type: 'ringIn', by: 'p2', now: 0 } })).toEqual({ t: 'act', action: { type: 'ringIn' } })
  })

  it('rejects anything malformed', () => {
    const bad = [
      'not json',
      'null',
      '[]',
      { t: 'nope' },
      { t: 'hello', room: 'A', name: '' },
      { t: 'hello', room: 'A'.repeat(17), name: 'Ann' },
      { t: 'settings', settings: { level: 5, difficulty: 'hard', mode: 'fast' } },
      { t: 'settings', settings: { level: 1, difficulty: 'hard', mode: 'turbo' } },
      { t: 'ping', sent: 'x' },
      { t: 'act', action: { type: 'tick', now: 0 } },
      { t: 'act', action: { type: 'select', ref: { col: -1, row: 0 } } },
      { t: 'act', action: { type: 'select', ref: { col: 1.5, row: 0 } } },
      { t: 'act', action: { type: 'ddWager', amount: Infinity } },
      { t: 'act', action: { type: 'ddWager', amount: '500' } },
      { t: 'act', action: { type: 'submitAnswer', text: 'x'.repeat(201) } },
      { t: 'act', action: { type: 'vote', agree: 'yes' } },
    ]
    for (const m of bad) expect(parseClientMessage(typeof m === 'string' ? m : JSON.stringify(m))).toBeNull()
  })
})

// ---------- clock ----------

describe('ClockSync', () => {
  it('estimates the offset from the shortest round trip', () => {
    const c = new ClockSync()
    expect(c.offset).toBe(0)
    expect(c.synced).toBe(false)
    // Server is 10_000ms ahead. A slow, lopsided trip gives a poor estimate; a quick one a good one.
    c.add(1_000, 11_400, 1_500) // rtt 500 → estimate 10_150
    c.add(2_000, 12_020, 2_040) // rtt 40 → estimate 10_000
    expect(c.rtt).toBe(40)
    expect(c.offset).toBe(10_000)
    expect(c.serverNow(5_000)).toBe(15_000)
  })

  it('only trusts recent samples, and ignores impossible ones', () => {
    const c = new ClockSync(2)
    c.add(0, 100, 10)
    c.add(100, 300, 150)
    c.add(200, 400, 250)
    expect(c.rtt).toBe(50) // the 10ms sample aged out
    c.add(500, 0, 400) // received before sent
    expect(c.rtt).toBe(50)
  })
})

// ---------- Hub and Room, through fake sockets ----------

function server() {
  let n = 0
  let codes = 0
  const hub = new Hub({
    banks: BANKS,
    rng: seeded(7),
    makeToken: () => `tok${++n}`,
    makeCode: () => ['ROOM', 'ROOM', 'NEXT'][codes++ % 3],
    idleRoomMs: 60_000,
  })
  return hub
}

/** A fake socket: records what the server sent it. */
function sock() {
  const got: ServerMessage[] = []
  const conn: Conn = { send: (t) => got.push(JSON.parse(t)) }
  return {
    conn,
    got,
    last: <T extends ServerMessage['t']>(t: T) => [...got].reverse().find((m) => m.t === t) as Extract<ServerMessage, { t: T }> | undefined,
  }
}

const say = (hub: Hub, s: ReturnType<typeof sock>, m: unknown, now = 0) => hub.message(s.conn, JSON.stringify(m), now)

function lobbyOfTwo() {
  const hub = server()
  const ann = sock()
  const ben = sock()
  say(hub, ann, { t: 'hello', room: '', name: 'Ann' })
  const code = ann.last('lobby')!.lobby.code
  say(hub, ben, { t: 'hello', room: code.toLowerCase(), name: 'Ben' })
  return { hub, ann, ben, code }
}

describe('Hub and Room', () => {
  it('creates a Room, lets others join by code, and makes the first member Host', () => {
    const { ann, ben, code } = lobbyOfTwo()
    expect(code).toBe('ROOM')
    expect(ann.got[0]).toEqual({ t: 'welcome', you: 'p1', token: 'tok1' })
    expect(ben.last('welcome')).toEqual({ t: 'welcome', you: 'p2', token: 'tok2' })
    const lobby = ann.last('lobby')!.lobby
    expect(lobby.host).toBe('p1')
    expect(lobby.members.map((m) => m.name)).toEqual(['Ann', 'Ben'])
    expect(lobby.playing).toBe(false)
  })

  it('never reuses a Room code that is in use', () => {
    const hub = server()
    const a = sock()
    const b = sock()
    say(hub, a, { t: 'hello', room: '', name: 'Ann' })
    say(hub, b, { t: 'hello', room: '', name: 'Ben' })
    expect(a.last('lobby')!.lobby.code).toBe('ROOM')
    expect(b.last('lobby')!.lobby.code).toBe('NEXT')
  })

  it('turns away bad names, taken names, unknown Rooms, a fourth member and strangers', () => {
    const { hub } = lobbyOfTwo()
    const x = sock()
    say(hub, x, { t: 'hello', room: 'ROOM', name: '   ' })
    expect(x.last('error')!.code).toBe('bad_name')
    say(hub, x, { t: 'hello', room: 'ROOM', name: ' ann ' })
    expect(x.last('error')!.code).toBe('name_taken')
    say(hub, x, { t: 'hello', room: 'ZZZZ', name: 'Cat' })
    expect(x.last('error')!.message).toContain('ZZZZ')
    say(hub, x, { t: 'start' })
    expect(x.last('error')!.code).toBe('not_joined')
    say(hub, x, { t: 'hello', room: 'ROOM', name: 'Cat' })
    expect(x.last('welcome')!.you).toBe('p3')
    const y = sock()
    say(hub, y, { t: 'hello', room: 'ROOM', name: 'Dan' })
    expect(y.last('error')!.code).toBe('room_full')
    say(hub, y, { t: 'hello', room: 'ROOM', name: 'Dan', token: 'guess' })
    expect(y.last('error')!.code).toBe('bad_token')
  })

  it('lets only the Host change settings and start', () => {
    const { hub, ann, ben } = lobbyOfTwo()
    say(hub, ben, { t: 'start' })
    expect(ben.last('error')!.code).toBe('not_host')
    say(hub, ben, { t: 'settings', settings: { level: 3, difficulty: 'easy', mode: 'fast' } })
    expect(ben.last('error')!.code).toBe('not_host')
    say(hub, ann, { t: 'settings', settings: { level: 3, difficulty: 'easy', mode: 'fast' } })
    expect(ben.last('lobby')!.lobby.settings).toEqual({ level: 3, difficulty: 'easy', mode: 'fast' })
    say(hub, ann, { t: 'start' })
    const view = ben.last('state')!.view
    expect(view.level).toBe(3)
    expect(view.mode).toBe('fast')
    expect(view.contestants.map((c) => [c.id, c.name, c.kind])).toEqual([
      ['p1', 'Ann', 'human'],
      ['p2', 'Ben', 'human'],
      ['bot1', expect.any(String), 'bot'],
    ])
    expect(ben.last('lobby')!.lobby.playing).toBe(true)
    const late = sock()
    say(hub, late, { t: 'hello', room: 'ROOM', name: 'Cat' })
    expect(late.last('error')!.code).toBe('in_progress')
  })

  it('sends each member only their own view, and nothing they already have', () => {
    const { hub, ann, ben } = lobbyOfTwo()
    say(hub, ann, { t: 'start' })
    const view = ann.last('state')!.view
    expect(view.board.cells.flat().every((c) => c.clue.answer === '')).toBe(true)
    const before = ann.got.length
    hub.tick(100) // nothing changed for Ann (the Board waits on her)…
    hub.tick(200)
    expect(ann.got.slice(before).filter((m) => m.t === 'state')).toHaveLength(1) // …except her turn's deadline appearing once
    expect(ben.last('state')!.view.turnUntil).toBe(100 + TURN_LIMITS.pickMs)
  })

  it('stamps actions with server time and plays them in order with what was already due', () => {
    const { hub, ann, ben } = lobbyOfTwo()
    say(hub, ann, { t: 'start' }, 0)
    const s0 = ann.last('state')!.view
    let ref = { col: 0, row: 0 }
    s0.board.cells.forEach((col, c) => col.forEach((_, r) => (ref = { col: c, row: r })))
    say(hub, ann, { t: 'act', action: { type: 'select', ref } }, 1_000)
    const picked = ann.last('state')!.view
    if (picked.phase.kind !== 'reading') throw new Error('expected a normal Clue with this seed')
    expect(picked.phase.until).toBe(1_000 + TIMING.selectMs + TIMING.readMs)
    // Ben rings in after reading time is over, with no tick in between: the Room catches up first
    // (opening Ring In), then applies his Ring In at the time it arrived.
    const arrived = picked.phase.until + 1
    say(hub, ben, { t: 'act', action: { type: 'ringIn' } }, arrived)
    expect(ben.last('state')!.view.phase).toEqual({
      kind: 'answering',
      contestant: 'p2',
      until: arrived + TIMING.answerMs,
      windowLeft: TIMING.ringMs - 1,
    })
  })

  it('keeps your seat when you drop, and lets you back in with your token', () => {
    const { hub, ann, ben } = lobbyOfTwo()
    say(hub, ann, { t: 'start' })
    hub.close(ben.conn, 10)
    expect(ann.last('lobby')!.lobby.members.find((m) => m.id === 'p2')!.connected).toBe(false)
    const back = sock()
    say(hub, back, { t: 'hello', room: 'ROOM', name: 'whatever', token: 'tok2' }, 20)
    expect(back.last('welcome')).toEqual({ t: 'welcome', you: 'p2', token: 'tok2' })
    expect(back.last('state')).toBeDefined() // the full view again, not just changes
    expect(ann.last('lobby')!.lobby.members.find((m) => m.id === 'p2')!.connected).toBe(true)
  })

  it('stops sending to an old socket once its seat is taken back by a new one', () => {
    const { hub, ann, ben } = lobbyOfTwo()
    const back = sock()
    say(hub, back, { t: 'hello', room: 'ROOM', name: 'Ben', token: 'tok2' })
    const before = ben.got.length
    say(hub, ann, { t: 'start' })
    expect(ben.got.length).toBe(before)
    expect(back.last('state')).toBeDefined()
    // The old socket can no longer act as Ben.
    say(hub, ben, { t: 'act', action: { type: 'ringIn' } })
    expect(ben.last('error')!.code).toBe('not_joined')
    // Taking the seat over again mid-game sends the whole view at once, not just later changes.
    const third = sock()
    say(hub, third, { t: 'hello', room: 'ROOM', name: 'Ben', token: 'tok2' }, 1)
    expect(third.last('state')).toBeDefined()
    // An old socket closing later doesn't mark Ben as gone.
    hub.close(ben.conn, 5)
    expect(ann.last('lobby')!.lobby.members.find((m) => m.id === 'p2')!.connected).toBe(true)
  })

  it('removes you from the lobby when you leave, and passes Host on', () => {
    const { hub, ann, ben } = lobbyOfTwo()
    say(hub, ann, { t: 'leave' })
    const lobby = ben.last('lobby')!.lobby
    expect(lobby.members.map((m) => m.id)).toEqual(['p2'])
    expect(lobby.host).toBe('p2')
  })

  it('drops a Room nobody has been connected to for a while', () => {
    const { hub, ann, ben } = lobbyOfTwo()
    hub.close(ann.conn, 0)
    hub.close(ben.conn, 0)
    hub.tick(1_000)
    expect(hub.roomCount).toBe(1)
    hub.tick(61_000)
    expect(hub.roomCount).toBe(0)
  })

  it('answers pings with server time, and rejects junk', () => {
    const { hub, ann } = lobbyOfTwo()
    say(hub, ann, { t: 'ping', sent: 5 }, 77)
    expect(ann.last('pong')).toEqual({ t: 'pong', sent: 5, serverTime: 77 })
    hub.message(ann.conn, '{"t":"act","action":{"type":"tick","now":0}}', 0)
    expect(ann.last('error')!.code).toBe('bad_message')
  })
})

// ---------- RemoteClient end to end ----------

/** A Transport wired straight into a Hub, with the server's clock under test control. */
function loopback(hub: Hub, clock: { now: number }): Transport & { open(): void } {
  const handlers = { open: () => {}, message: (_: ServerMessage) => {}, close: () => {} }
  const conn: Conn = { send: (t) => handlers.message(JSON.parse(t)) }
  return {
    open: () => handlers.open(),
    send: (m) => hub.message(conn, JSON.stringify(m), clock.now),
    close: () => {
      hub.close(conn, clock.now)
      handlers.close()
    },
    onOpen: (cb) => (handlers.open = cb),
    onMessage: (cb) => (handlers.message = cb),
    onClose: (cb) => (handlers.close = cb),
  }
}

describe('RemoteClient', () => {
  it('plays a Clue between two people, each seeing their own view', () => {
    const hub = server()
    const serverClock = { now: 0 }
    const ta = loopback(hub, serverClock)
    const ann = new RemoteClient(ta, { room: '', name: 'Ann' }, () => serverClock.now - 3_000) // Ann's clock is 3s slow
    ta.open()
    const code = ann.snapshot.lobby!.code
    const tb = loopback(hub, serverClock)
    const ben = new RemoteClient(tb, { room: code, name: 'Ben' })
    tb.open()
    expect(ann.snapshot.you).toBe('p1')
    expect(ben.snapshot.you).toBe('p2')
    expect(ann.rejoinToken).toBeDefined()

    // Clock sync: Ann's estimate of server time corrects for her slow clock.
    ann.pingIfDue(0)
    expect(ann.serverNow()).toBe(serverClock.now)

    ann.start()
    expect(ben.snapshot.view?.contestants).toHaveLength(3)
    const ref = firstNormal(ann.snapshot.view!)
    serverClock.now = 1_000
    ann.act({ type: 'select', ref })
    serverClock.now = 1_000 + TIMING.selectMs + TIMING.readMs
    hub.tick(serverClock.now)
    expect(ben.snapshot.view!.phase.kind).toBe('ringIn')
    // Silence the Bot so the test controls the Clue (reaching into the server's state).
    const room = (hub as unknown as { rooms: Map<string, { state: GameState }> }).rooms.get(code)!
    room.state.clue!.botRingAt = {}
    room.state.clue!.botKnows = {}
    serverClock.now += 100
    ben.act({ type: 'ringIn' })
    const answer = currentCell(room.state)!.clue.answer
    expect(ann.snapshot.view!.phase).toMatchObject({ kind: 'answering', contestant: 'p2' })
    // Ann's copy of the current Clue has no Answer until the reveal.
    expect(currentCell(ann.snapshot.view!)!.clue.answer).toBe('')
    serverClock.now += 100
    ben.act({ type: 'submitAnswer', text: answer })
    expect(ann.snapshot.view!.phase.kind).toBe('reveal')
    expect(currentCell(ann.snapshot.view!)!.clue.answer).toBe(answer)
    expect(ann.snapshot.view!.contestants.find((c) => c.id === 'p2')!.score).toBeGreaterThan(0)

    // Continue waits for both.
    ann.act({ type: 'continue' })
    expect(ben.snapshot.view!.phase.kind).toBe('reveal')
    ben.act({ type: 'continue' })
    expect(ben.snapshot.view!.phase.kind).toBe('board')
    expect(ben.snapshot.view!.selector).toBe('p2')
  })

  it("doesn't ping before it has joined (the server would answer with an error)", () => {
    const sent: ClientMessage[] = []
    let open = () => {}
    const t: Transport = { send: (m) => sent.push(m), close: () => {}, onOpen: (cb) => (open = cb), onMessage: () => {}, onClose: () => {} }
    const c = new RemoteClient(t, { room: 'ABCD', name: 'Ann' }, () => 1_000)
    open()
    c.pingIfDue(0)
    expect(sent.map((m) => m.t)).toEqual(['hello'])
  })

  it('rejoins its seat with the saved token after the connection drops', () => {
    const hub = server()
    const clock = { now: 0 }
    const t1 = loopback(hub, clock)
    const ann = new RemoteClient(t1, { room: '', name: 'Ann' })
    t1.open()
    const code = ann.snapshot.lobby!.code
    const token = ann.rejoinToken!
    t1.close()
    expect(ann.snapshot.connected).toBe(false)
    const t2 = loopback(hub, clock)
    const again = new RemoteClient(t2, { room: code, name: 'Ann', token })
    t2.open()
    expect(again.snapshot.you).toBe('p1')
    expect(again.snapshot.error).toBeUndefined()
  })
})

function firstNormal(s: GameState) {
  for (let col = 0; col < 6; col++) for (let row = 0; row < 5; row++) if (!s.board.cells[col][row].played) return { col, row }
  throw new Error('none')
}
