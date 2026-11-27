import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameState, HumanAction } from '../engine/game'
import type { ContestantId } from '../engine/types'
import { RemoteClient, webSocketTransport, type ClientSnapshot } from '../net/client'
import type { RoomSettings } from '../net/protocol'
import { countdownSecond, cuesFor, waitSecond } from './cues'
import { play } from './sound'

/**
 * Where the game server listens: the same host as the page, on /ws (Caddy routes it in production;
 * `npm run dev` proxies it to a local server). VITE_QUIZZER_WS overrides it.
 */
export function serverUrl(): string {
  const override = import.meta.env.VITE_QUIZZER_WS as string | undefined
  if (override) return override
  return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`
}

/** This tab's seat, so a reload or dropped connection rejoins it. Per tab, so two tabs are two players. */
const SEAT_KEY = 'quizzer.online.seat'
interface SavedSeat {
  room: string
  name: string
  token: string
}

function loadSeat(): SavedSeat | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(SEAT_KEY) ?? 'null')
    return s && typeof s.room === 'string' && typeof s.token === 'string' ? s : null
  } catch {
    return null
  }
}

function saveSeat(seat: SavedSeat | null) {
  try {
    if (seat) sessionStorage.setItem(SEAT_KEY, JSON.stringify(seat))
    else sessionStorage.removeItem(SEAT_KEY)
  } catch {
    // Without storage, a reload just loses the seat.
  }
}

const RETRY_MS = [1_000, 2_000, 4_000, 8_000]

export interface OnlineGame extends ClientSnapshot {
  /** True from create/join until leaving: show the online screens. */
  active: boolean
  /** Still trying to (re)connect after a drop. */
  reconnecting: boolean
  /** Couldn't reach the server at all. */
  unreachable: boolean
  /** The game this tab was in is gone (the server restarted, or the seat was given up). */
  seatLost: boolean
  state: GameState | null
  now: number
  me: ContestantId
  create(name: string): void
  join(code: string, name: string): void
  dispatch(a: HumanAction): void
  changeSettings(s: RoomSettings): void
  start(): void
  kick(id: ContestantId): void
  leave(): void
}

/**
 * Online play: the same shape as useGame (state, now, dispatch, me), backed by a RemoteClient.
 * The server runs the game; this keeps the latest view, plays sound cues for changes in it, shows
 * countdowns in server time, and reconnects to the same seat after a drop. Online games aren't
 * recorded in Game History.
 */
export function useOnlineGame(): OnlineGame {
  const [snap, setSnap] = useState<ClientSnapshot>({ connected: false })
  const [active, setActive] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  /** The connection closed before the server let us in: no server, or it's down. */
  const [unreachable, setUnreachable] = useState(false)
  /** A rejoin was refused: the game this tab was in is gone. */
  const [seatLost, setSeatLost] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const client = useRef<RemoteClient | null>(null)
  const prevView = useRef<GameState | undefined>(undefined)
  const meRef = useRef<ContestantId>('human')
  const retry = useRef(0)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  /** Bumped on every deliberate connect or leave, so a stale socket's close doesn't trigger a retry. */
  const generation = useRef(0)

  const connect = useCallback((room: string, name: string, token?: string) => {
    const gen = ++generation.current
    setUnreachable(false)
    setSeatLost(false)
    client.current?.leaveQuietly()
    const c = new RemoteClient(webSocketTransport(serverUrl()), { room, name, token })
    client.current = c
    c.subscribe((s) => {
      if (gen !== generation.current) return
      if (s.you) meRef.current = s.you
      if (s.you && s.lobby && c.rejoinToken) {
        saveSeat({ room: s.lobby.code, name, token: c.rejoinToken })
        retry.current = 0
        setReconnecting(false)
      }
      // Refused while rejoining (the seat or the whole Room is gone, e.g. the server restarted):
      // stop retrying and forget the seat; the lobby screen shows why.
      if (s.error && !s.you && token) {
        saveSeat(null)
        setReconnecting(false)
        setSeatLost(true)
      }
      // Removed by the Host: the seat is gone, and there's nothing to reconnect to.
      if (s.error?.code === 'kicked') {
        saveSeat(null)
        setReconnecting(false)
        generation.current++
      }
      const next = s.view
      const prev = prevView.current
      if (next && prev && next !== prev) for (const cue of cuesFor(prev, next, meRef.current)) play(cue)
      prevView.current = next
      setSnap(s)
    })
    c.onDisconnect(() => {
      if (gen !== generation.current) return
      const seat = loadSeat()
      if (!seat) {
        if (!c.snapshot.you) setUnreachable(true)
        return
      }
      setReconnecting(true)
      const wait = RETRY_MS[Math.min(retry.current++, RETRY_MS.length - 1)]
      retryTimer.current = setTimeout(() => connect(seat.room, seat.name, seat.token), wait)
    })
  }, [])

  // Rejoin this tab's seat after a reload.
  useEffect(() => {
    const seat = loadSeat()
    if (!seat) return
    setActive(true)
    connect(seat.room, seat.name, seat.token)
  }, [connect])

  // Clock, pings and countdown ticks.
  useEffect(() => {
    let lastPing = 0
    let lastTick: string | null = null
    let lastBeep: string | null = null
    const id = setInterval(() => {
      const c = client.current
      if (!c) return
      lastPing = c.pingIfDue(lastPing)
      const t = c.serverNow()
      setNow(t)
      const s = c.snapshot.view
      const me = meRef.current
      const sec = s ? countdownSecond(s, t, me) : null
      const key = sec === null ? null : `${s!.phase.kind}:${'until' in s!.phase ? s!.phase.until : ''}:${sec}`
      if (key !== null && key !== lastTick) play(sec === 1 ? 'tickLast' : 'tick')
      lastTick = key
      const w = s ? waitSecond(s, t, me) : null
      const wKey = w === null ? null : `${s!.phase.kind}:${'until' in s!.phase ? s!.phase.until : ''}:${w}`
      if (wKey !== null && wKey !== lastBeep) play('beep')
      lastBeep = wKey
    }, 100)
    return () => clearInterval(id)
  }, [])

  const create = useCallback(
    (name: string) => {
      play('start') // unlocks audio inside the tap (iOS)
      setActive(true)
      connect('', name)
    },
    [connect],
  )
  const join = useCallback(
    (code: string, name: string) => {
      play('start')
      setActive(true)
      connect(code.trim().toUpperCase(), name)
    },
    [connect],
  )
  const leave = useCallback(() => {
    generation.current++
    clearTimeout(retryTimer.current)
    client.current?.leave()
    client.current = null
    prevView.current = undefined
    saveSeat(null)
    setSnap({ connected: false })
    setActive(false)
    setReconnecting(false)
  }, [])

  return {
    ...snap,
    active,
    reconnecting,
    unreachable,
    seatLost,
    state: snap.view ?? null,
    now,
    me: snap.you ?? 'human',
    create,
    join,
    leave,
    dispatch: useCallback((a: HumanAction) => client.current?.act(a), []),
    changeSettings: useCallback((s: RoomSettings) => client.current?.changeSettings(s), []),
    start: useCallback(() => client.current?.start(), []),
    kick: useCallback((id: ContestantId) => client.current?.kick(id), []),
  }
}
