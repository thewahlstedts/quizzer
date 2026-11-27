import { startServer } from './server'

// Entry point: `npm run build:server && node dist-server/index.js`.
//   PORT             default 8787
//   ALLOWED_ORIGINS  comma-separated; if set, WebSocket upgrades from any other Origin get 403
//   Limits (defaults in parentheses; see server.ts and src/net/hub.ts):
//   MAX_CONNECTIONS (2000), MAX_CONNECTIONS_PER_IP (8), MAX_ROOMS (500),
//   ROOMS_PER_IP_PER_MINUTE (10), FAILED_JOINS_PER_IP_PER_MINUTE (20)
//   Per-address limits rely on the client address: the last X-Forwarded-For entry when the
//   connection comes from a private address (Caddy). If another proxy (e.g. a CDN) sits in front of
//   Caddy, every client shares its addresses: raise or rethink the per-IP limits.

const port = Number(process.env.PORT ?? 8787)
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error(`Bad PORT: ${process.env.PORT}`)
  process.exit(1)
}
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

/** A positive integer from the environment, or undefined to use the default. */
function intEnv(name: string): number | undefined {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return undefined
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) {
    console.error(`Bad ${name}: ${raw}`)
    process.exit(1)
  }
  return n
}

const server = await startServer({
  port,
  allowedOrigins,
  maxConnections: intEnv('MAX_CONNECTIONS'),
  maxConnectionsPerIp: intEnv('MAX_CONNECTIONS_PER_IP'),
  hubLimits: {
    maxRooms: intEnv('MAX_ROOMS'),
    roomsPerIpPerMinute: intEnv('ROOMS_PER_IP_PER_MINUTE'),
    failedJoinsPerIpPerMinute: intEnv('FAILED_JOINS_PER_IP_PER_MINUTE'),
  },
})
console.log(
  `Quizzer server on :${server.port} (WebSocket /ws, health /health)` +
    (allowedOrigins.length ? `; origins: ${allowedOrigins.join(', ')}` : '; any origin'),
)

let stopping = false
function stop(signal: string) {
  if (stopping) return
  stopping = true
  console.log(`${signal}: shutting down`)
  // Don't hang on a stuck connection: Docker sends SIGKILL after its own timeout anyway.
  setTimeout(() => process.exit(0), 5000).unref()
  void server.close().then(() => process.exit(0))
}
process.on('SIGTERM', () => stop('SIGTERM'))
process.on('SIGINT', () => stop('SIGINT'))
