import { startServer } from './server'

// Entry point: `npm run build:server && node dist-server/index.js`.
//   PORT             default 8787
//   ALLOWED_ORIGINS  comma-separated; if set, WebSocket upgrades from any other Origin get 403

const port = Number(process.env.PORT ?? 8787)
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error(`Bad PORT: ${process.env.PORT}`)
  process.exit(1)
}
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const server = await startServer({ port, allowedOrigins })
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
