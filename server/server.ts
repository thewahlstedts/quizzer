import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { Duplex } from 'node:stream'
import { randomInt, randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { WebSocketServer, type WebSocket } from 'ws'
import { BANKS } from '../src/content'
import { Hub, type Conn } from '../src/net/hub'

/**
 * The online-play server (ADR 0004): an HTTP server with a health check, and WebSockets on `/ws`
 * whose text frames go to a Hub. Every game rule is in the Hub; this file only moves bytes.
 */
export interface ServerOptions {
  port: number
  host?: string
  /** If non-empty, WebSocket upgrades whose Origin isn't listed are refused with 403. */
  allowedOrigins?: string[]
  /** A connection sending more than this many frames within one second is closed (1008). */
  maxMessagesPerSecond?: number
  /** Ping every socket this often; one that hasn't answered the previous ping is terminated. */
  heartbeatMs?: number
  tickMs?: number
  log?: (msg: string) => void
}

export interface QuizzerServer {
  /** The port actually bound (useful with `port: 0`). */
  port: number
  hub: Hub
  close(): Promise<void>
}

const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const MAX_PAYLOAD = 4096
/** A client that stops reading gets cut off rather than buffering without limit. */
const MAX_BUFFERED = 1 << 20

export function makeRoomCode(): string {
  let code = ''
  for (let i = 0; i < 4; i++) code += CODE_LETTERS[randomInt(CODE_LETTERS.length)]
  return code
}

export async function startServer(opts: ServerOptions): Promise<QuizzerServer> {
  const log = opts.log ?? ((m: string) => console.log(m))
  const allowed = new Set(opts.allowedOrigins?.filter(Boolean) ?? [])
  const maxPerSecond = opts.maxMessagesPerSecond ?? 20
  const hub = new Hub({ banks: BANKS, rng: Math.random, makeToken: () => randomUUID(), makeCode: makeRoomCode })

  /** Never let one bad message or engine bug take every game down with the process. */
  const guard = (what: string, fn: () => void) => {
    try {
      fn()
    } catch (e) {
      log(`${what} failed: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`)
    }
  }

  const http: Server = createServer((req, res) => {
    const path = pathname(req)
    if (req.method === 'GET' && path === '/health') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('ok\n')
    } else if (path === '/ws') {
      // A plain request to the socket path: say so, rather than a 404 that looks like a wrong URL.
      res.writeHead(426, { 'content-type': 'text/plain', upgrade: 'websocket', connection: 'Upgrade' }).end('WebSocket upgrade required\n')
    } else {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found\n')
    }
  })

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD })
  const alive = new WeakMap<WebSocket, boolean>()

  http.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (pathname(req) !== '/ws') return reject(socket, 404, 'Not Found')
    if (allowed.size > 0 && !allowed.has(req.headers.origin ?? '')) return reject(socket, 403, 'Forbidden')
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
  })

  wss.on('connection', (ws: WebSocket) => {
    alive.set(ws, true)
    ws.on('pong', () => alive.set(ws, true))
    const conn: Conn = {
      send(text) {
        if (ws.readyState !== ws.OPEN) return
        if (ws.bufferedAmount > MAX_BUFFERED) return void ws.terminate()
        ws.send(text)
      },
    }
    let windowStart = 0
    let count = 0
    ws.on('message', (data, isBinary) => {
      const now = Date.now()
      if (now - windowStart >= 1000) {
        windowStart = now
        count = 0
      }
      if (++count > maxPerSecond) return void ws.close(1008, 'Too many messages')
      if (isBinary) return
      guard('message', () => hub.message(conn, data.toString(), now))
    })
    ws.on('close', () => guard('close', () => hub.close(conn, Date.now())))
    ws.on('error', () => ws.terminate())
  })

  const ticker = setInterval(() => guard('tick', () => hub.tick(Date.now())), opts.tickMs ?? 100)
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.get(ws)) {
        ws.terminate()
        continue
      }
      alive.set(ws, false)
      ws.ping()
    }
  }, opts.heartbeatMs ?? 30_000)

  await new Promise<void>((resolve, reject) => {
    http.once('error', reject)
    http.listen(opts.port, opts.host ?? '0.0.0.0', () => {
      http.off('error', reject)
      resolve()
    })
  })
  const port = (http.address() as AddressInfo).port

  return {
    port,
    hub,
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(ticker)
        clearInterval(heartbeat)
        for (const ws of wss.clients) ws.close(1001, 'Server shutting down')
        wss.close()
        http.close(() => resolve())
        http.closeAllConnections()
      }),
  }
}

function pathname(req: IncomingMessage): string {
  const url = req.url ?? '/'
  const q = url.indexOf('?')
  return q === -1 ? url : url.slice(0, q)
}

function reject(socket: Duplex, status: number, text: string) {
  socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
}
