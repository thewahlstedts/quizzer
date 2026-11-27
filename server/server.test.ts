import { request } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import type { ServerMessage } from '../src/net/protocol'
import { WebSocket as NodeWebSocket } from 'ws'
import { clientIp, isPrivate, makeRoomCode, startServer, type QuizzerServer, type ServerOptions } from './server'

// Real sockets on a random port; clients are Node 22's global WebSocket.

const running: QuizzerServer[] = []
afterEach(async () => {
  await Promise.all(running.splice(0).map((s) => s.close()))
})

async function serve(opts: Partial<ServerOptions> = {}) {
  const s = await startServer({ port: 0, host: '127.0.0.1', log: () => {}, ...opts })
  running.push(s)
  return s
}

/** A WebSocket client that queues every message so a test can wait for the one it wants. */
class Client {
  readonly ws: WebSocket
  readonly received: ServerMessage[] = []
  private waiters: (() => void)[] = []
  readonly opened: Promise<void>
  readonly closed: Promise<{ code: number }>

  constructor(port: number) {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`)
    this.opened = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve(), { once: true })
      this.ws.addEventListener('error', () => reject(new Error('socket error')), { once: true })
    })
    this.closed = new Promise((resolve) => this.ws.addEventListener('close', (e) => resolve({ code: e.code }), { once: true }))
    this.ws.addEventListener('message', (e) => {
      this.received.push(JSON.parse(String(e.data)))
      this.waiters.splice(0).forEach((w) => w())
    })
  }

  send(msg: unknown) {
    this.ws.send(JSON.stringify(msg))
  }

  /** The first received message (in order) of type `t` not yet taken. */
  async next<T extends ServerMessage['t']>(t: T, timeoutMs = 2000): Promise<Extract<ServerMessage, { t: T }>> {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const i = this.received.findIndex((m) => m.t === t)
      if (i !== -1) return this.received.splice(i, 1)[0] as Extract<ServerMessage, { t: T }>
      const left = deadline - Date.now()
      if (left <= 0) throw new Error(`no ${t} message; got ${JSON.stringify(this.received.map((m) => m.t))}`)
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, left)
        this.waiters.push(() => {
          clearTimeout(timer)
          resolve()
        })
      })
    }
  }
}

function httpGet(port: number, path: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, headers }, (res) => {
      let body = ''
      res.on('data', (c) => (body += c))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
    })
    req.on('error', reject)
    req.end()
  })
}

/** The status line of a WebSocket upgrade attempt with the given Origin (or none). */
function upgradeStatus(port: number, origin?: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request({
      host: '127.0.0.1',
      port,
      path: '/ws',
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
        ...(origin ? { Origin: origin } : {}),
      },
    })
    req.on('upgrade', (res, socket) => {
      socket.destroy()
      resolve(res.statusCode ?? 0)
    })
    req.on('response', (res) => {
      res.resume()
      resolve(res.statusCode ?? 0)
    })
    req.on('error', reject)
    req.end()
  })
}

describe('server', () => {
  it('two clients create, join and start a Room over real sockets', async () => {
    const s = await serve()
    const ann = new Client(s.port)
    const bob = new Client(s.port)
    await Promise.all([ann.opened, bob.opened])

    ann.send({ t: 'hello', room: '', name: 'Ann' })
    const annWelcome = await ann.next('welcome')
    const { lobby } = await ann.next('lobby')
    expect(lobby.code).toMatch(/^[A-HJ-NP-Z]{5}$/)
    expect(lobby.host).toBe(annWelcome.you)

    bob.send({ t: 'hello', room: lobby.code.toLowerCase(), name: 'Bob' })
    const bobWelcome = await bob.next('welcome')
    expect(bobWelcome.you).not.toBe(annWelcome.you)
    const bobLobby = await bob.next('lobby')
    expect(bobLobby.lobby.members.map((m) => m.name)).toEqual(['Ann', 'Bob'])

    ann.send({ t: 'start' })
    const [a, b] = await Promise.all([ann.next('state'), bob.next('state')])
    expect(a.view.contestants.map((c) => c.name)).toEqual(expect.arrayContaining(['Ann', 'Bob']))
    expect(b.view.contestants.map((c) => c.name)).toEqual(expect.arrayContaining(['Ann', 'Bob']))
    expect(typeof a.serverTime).toBe('number')
    expect(s.hub.roomCount).toBe(1)
  })

  it('answers bad JSON with an error, ignores binary frames, and closes oversized frames', async () => {
    const s = await serve()
    const c = new Client(s.port)
    await c.opened
    c.ws.send(new Uint8Array([1, 2, 3]))
    c.ws.send('not json')
    expect((await c.next('error')).code).toBe('bad_message')
    c.send({ t: 'hello', room: '', name: 'Ann' })
    await c.next('welcome')
    expect(c.received.some((m) => m.t === 'error')).toBe(false) // the binary frame produced nothing
    c.ws.send('x'.repeat(5000))
    expect((await c.closed).code).toBe(1009)
  })

  it('serves /health, 426 on a plain /ws request, and 404 elsewhere', async () => {
    const s = await serve()
    expect(await httpGet(s.port, '/health')).toEqual({ status: 200, body: 'ok\n' })
    expect((await httpGet(s.port, '/ws')).status).toBe(426)
    expect((await httpGet(s.port, '/')).status).toBe(404)
    expect((await httpGet(s.port, '/health/x')).status).toBe(404)
  })

  it('refuses WebSocket upgrades from other Origins when ALLOWED_ORIGINS is set', async () => {
    const s = await serve({ allowedOrigins: ['https://quizzer.thewahlstedts.com'] })
    expect(await upgradeStatus(s.port, 'https://quizzer.thewahlstedts.com')).toBe(101)
    expect(await upgradeStatus(s.port, 'https://evil.example')).toBe(403)
    expect(await upgradeStatus(s.port)).toBe(403)
  })

  it('accepts any Origin when none are configured', async () => {
    const s = await serve()
    expect(await upgradeStatus(s.port, 'https://evil.example')).toBe(101)
  })

  it('closes a connection that sends more than ~20 messages a second (1008)', async () => {
    const s = await serve()
    const c = new Client(s.port)
    await c.opened
    for (let i = 0; i < 30; i++) c.send({ t: 'ping', sent: i })
    expect((await c.closed).code).toBe(1008)
  })

  it('does not close a connection sending at a normal pace', async () => {
    const s = await serve()
    const c = new Client(s.port)
    await c.opened
    c.send({ t: 'hello', room: '', name: 'Ann' })
    for (let i = 0; i < 15; i++) c.send({ t: 'ping', sent: i })
    for (let i = 0; i < 15; i++) await c.next('pong')
    expect(c.ws.readyState).toBe(WebSocket.OPEN)
  })

  it('terminates sockets that stop answering pings', async () => {
    const s = await serve({ heartbeatMs: 50 })
    // Node's WebSocket answers pings, so it survives several heartbeats...
    const c = new Client(s.port)
    await c.opened
    await new Promise((r) => setTimeout(r, 250))
    expect(c.ws.readyState).toBe(WebSocket.OPEN)
    // ...while a raw upgraded socket that never reads or replies is cut off.
    const status = await new Promise<number>((resolve) => {
      const req = request({
        host: '127.0.0.1',
        port: s.port,
        path: '/ws',
        headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==' },
      })
      req.on('upgrade', (_res, socket) => {
        socket.on('close', () => resolve(1))
        socket.resume() // read (and drop) the pings, never answer them
      })
      req.end()
    })
    expect(status).toBe(1)
  })

  it('makes 5-letter Room codes without I or O', () => {
    for (let i = 0; i < 200; i++) expect(makeRoomCode()).toMatch(/^[A-HJ-NP-Z]{5}$/)
  })

  it('limits open connections per client address, using the proxy-supplied address', async () => {
    const s = await serve({ maxConnectionsPerIp: 2 })
    const open = (ip: string) => wsFrom(s.port, ip)
    const a1 = await open('5.5.5.5')
    const a2 = await open('5.5.5.5')
    await expect(open('5.5.5.5')).rejects.toThrow('429')
    const other = await open('7.7.7.7') // a different player is fine
    a1.close()
    await new Promise((r) => a1.once('close', r))
    await new Promise((r) => setTimeout(r, 50))
    const again = await open('5.5.5.5') // a slot freed up
    for (const w of [a2, other, again]) w.close()
  })

  it('limits open connections in total', async () => {
    const s = await serve({ maxConnections: 1 })
    const first = await wsFrom(s.port, '1.1.1.1')
    await expect(wsFrom(s.port, '2.2.2.2')).rejects.toThrow('503')
    first.close()
  })

  it('tells the Hub each connection\'s address, so Hosts can remove people for good', async () => {
    const s = await serve()
    const host = new Client(s.port)
    await host.opened
    host.send({ t: 'hello', room: '', name: 'Ann' })
    const code = (await host.next('lobby')).lobby.code
    const eve = await wsFrom(s.port, '6.6.6.6')
    const eveSays = (m: unknown) => eve.send(JSON.stringify(m))
    const eveGot: ServerMessage[] = []
    eve.on('message', (d) => eveGot.push(JSON.parse(String(d))))
    eveSays({ t: 'hello', room: code, name: 'Eve' })
    const eveId = (await host.next('lobby')).lobby.members.find((m) => m.name === 'Eve')!.id
    host.send({ t: 'kick', id: eveId })
    await host.next('lobby')
    const back = await wsFrom(s.port, '6.6.6.6')
    const backGot: ServerMessage[] = []
    back.on('message', (d) => backGot.push(JSON.parse(String(d))))
    back.send(JSON.stringify({ t: 'hello', room: code, name: 'Evelyn' }))
    await new Promise((r) => setTimeout(r, 100))
    expect(eveGot.some((m) => m.t === 'error' && m.code === 'kicked')).toBe(true)
    expect(backGot).toEqual([{ t: 'error', code: 'banned', message: 'You were removed from this room.' }])
    for (const w of [eve, back]) w.close()
  })
})

describe('clientIp', () => {
  it('trusts X-Forwarded-For only from a private address (the proxy), taking its last entry', () => {
    expect(clientIp('172.18.0.5', '203.0.113.9')).toBe('203.0.113.9')
    expect(clientIp('::ffff:127.0.0.1', '1.2.3.4, 203.0.113.9')).toBe('203.0.113.9')
    expect(clientIp('10.0.0.2', ['9.9.9.9', '203.0.113.9'])).toBe('203.0.113.9')
    // A client connecting directly can't pick its own address.
    expect(clientIp('198.51.100.7', '1.2.3.4')).toBe('198.51.100.7')
    expect(clientIp('::ffff:198.51.100.7', undefined)).toBe('198.51.100.7')
    expect(clientIp('172.18.0.5', '')).toBe('172.18.0.5')
  })

  it('recognizes private and loopback addresses', () => {
    for (const a of ['127.0.0.1', '::1', '10.1.2.3', '192.168.0.9', '172.16.0.1', '172.31.255.255', 'fd12:3456::1', '::ffff:10.0.0.1'])
      expect(isPrivate(a)).toBe(true)
    for (const a of ['8.8.8.8', '172.15.0.1', '172.32.0.1', '203.0.113.9', '2001:db8::1'])
      expect(isPrivate(a)).toBe(false)
  })
})

/** A `ws` client from 127.0.0.1 claiming (via the proxy header) to be `ip`; rejects with the HTTP status if refused. */
function wsFrom(port: number, ip: string): Promise<NodeWebSocket> {
  return new Promise((resolve, reject) => {
    const w = new NodeWebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { 'x-forwarded-for': ip } })
    w.once('open', () => resolve(w))
    w.once('unexpected-response', (_req, res) => reject(new Error(String(res.statusCode))))
    w.once('error', reject)
  })
}
