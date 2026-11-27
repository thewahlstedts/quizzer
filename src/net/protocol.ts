import type { GameState, HumanAction } from '../engine/game'
import { GAME_MODES, type BotDifficulty, type ContestantId, type GameMode, type Level } from '../engine/types'

/**
 * Messages between a browser and the game server, as JSON over one WebSocket per player.
 * The server runs a Room (room.ts) per game; this file is shared by both sides.
 */

export interface RoomSettings {
  level: Level
  difficulty: BotDifficulty
  mode: GameMode
}

export interface LobbyMember {
  id: ContestantId
  name: string
  connected: boolean
}

export interface Lobby {
  code: string
  host: ContestantId
  members: LobbyMember[]
  settings: RoomSettings
  /** True once the Host has started a game (members stay in the Room for rematches). */
  playing: boolean
}

export type ClientMessage =
  /** Join a Room (an empty `room` creates one), or rejoin it with the token the server gave you. Always the first message. */
  | { t: 'hello'; room: string; name: string; token?: string }
  /** Host only, between games. */
  | { t: 'settings'; settings: RoomSettings }
  /** Host only: start a game (or a rematch) with everyone in the Room. */
  | { t: 'start' }
  | { t: 'act'; action: HumanAction }
  /** Clock sync: the server answers with its time. `sent` is the client's clock. */
  | { t: 'ping'; sent: number }
  /** Leave the Room for good (closing the socket only disconnects; you keep your seat). */
  | { t: 'leave' }

export type ServerMessage =
  /** You're in. Keep `token` to rejoin after a dropped connection. */
  | { t: 'welcome'; you: ContestantId; token: string }
  | { t: 'lobby'; lobby: Lobby }
  /** Your view of the game (engine/view.ts) as of server time `serverTime`. */
  | { t: 'state'; view: GameState; serverTime: number }
  | { t: 'pong'; sent: number; serverTime: number }
  | { t: 'error'; code: ErrorCode; message: string }

export type ErrorCode =
  | 'bad_message'
  | 'not_joined'
  | 'room_full'
  | 'in_progress'
  | 'bad_name'
  | 'name_taken'
  | 'bad_token'
  | 'not_host'
  | 'not_playing'

export const NAME_MAX = 20
const TEXT_MAX = 200
const LEVELS: Level[] = [1, 2, 3, 4]
const DIFFICULTIES: BotDifficulty[] = ['easy', 'normal', 'hard']

/**
 * Validate a message from a client. Anything not exactly one of the shapes above is rejected
 * (null), so the server never feeds untrusted JSON to the engine.
 */
export function parseClientMessage(raw: string): ClientMessage | null {
  let m: unknown
  try {
    m = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isObj(m)) return null
  switch (m.t) {
    case 'hello':
      // An empty `room` asks the server to create one.
      if (!isStr(m.room, 16, true) || !isStr(m.name, 100)) return null
      if (m.token !== undefined && !isStr(m.token, 100)) return null
      return { t: 'hello', room: m.room, name: m.name, ...(m.token !== undefined ? { token: m.token as string } : {}) }
    case 'settings': {
      const s = m.settings
      if (!isObj(s) || !LEVELS.includes(s.level as Level) || !DIFFICULTIES.includes(s.difficulty as BotDifficulty)) return null
      if (!GAME_MODES.includes(s.mode as GameMode)) return null
      return { t: 'settings', settings: { level: s.level as Level, difficulty: s.difficulty as BotDifficulty, mode: s.mode as GameMode } }
    }
    case 'start':
      return { t: 'start' }
    case 'leave':
      return { t: 'leave' }
    case 'ping':
      return isNum(m.sent) ? { t: 'ping', sent: m.sent } : null
    case 'act': {
      const action = parseAction(m.action)
      return action ? { t: 'act', action } : null
    }
    default:
      return null
  }
}

function parseAction(a: unknown): HumanAction | null {
  if (!isObj(a)) return null
  switch (a.type) {
    case 'ringIn':
    case 'continue':
    case 'override':
      return { type: a.type }
    case 'select': {
      const r = a.ref
      if (!isObj(r) || !isInt(r.col) || !isInt(r.row)) return null
      return { type: 'select', ref: { col: r.col, row: r.row } }
    }
    case 'submitAnswer':
      return isStr(a.text, TEXT_MAX, true) ? { type: 'submitAnswer', text: a.text } : null
    case 'ddWager':
    case 'finalWager':
      return isNum(a.amount) ? { type: a.type, amount: a.amount } : null
    case 'finalChoose':
      return isStr(a.categoryId, 100) ? { type: 'finalChoose', categoryId: a.categoryId } : null
    case 'vote':
      return typeof a.agree === 'boolean' ? { type: 'vote', agree: a.agree } : null
    default:
      return null
  }
}

/** A display name: trimmed, inner whitespace collapsed, 1..NAME_MAX characters. */
export function cleanName(name: string): string | null {
  const n = name.trim().replace(/\s+/g, ' ')
  return n.length >= 1 && n.length <= NAME_MAX ? n : null
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isStr = (x: unknown, max: number, allowEmpty = false): x is string =>
  typeof x === 'string' && x.length <= max && (allowEmpty || x.length > 0)
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const isInt = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0 && (x as number) < 100
