import type { GameState } from '../engine/game'
import type { BotDifficulty, ContestantId, GameMode, Level } from '../engine/types'

/** One finished game, saved in this browser for the Human to review. Quit games aren't recorded. */
export interface GameRecord {
  v: 1
  id: string
  /** ms since epoch */
  endedAt: number
  level: Level
  botDifficulty: BotDifficulty
  mode: GameMode
  contestants: { id: ContestantId; name: string; score: number }[]
  /** The Human's final score: this game's Earnings (can be negative). */
  earnings: number
  /** 1 = first; ties share a place. */
  place: number
  won: boolean
  correct: number
  wrong: number
}

export type Period = 'today' | 'week' | 'month' | 'all'
export const PERIODS: { id: Period; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'all', label: 'All time' },
]

export interface Summary {
  games: number
  wins: number
  earnings: number
  correct: number
  wrong: number
  /** Highest single-game Earnings, or null with no games. */
  best: number | null
}

const KEY = 'quizzer.history.v1'
const MAX_RECORDS = 2000

export function recordFromState(s: GameState, endedAt: number): GameRecord {
  const human = s.contestants.find((c) => c.id === 'human')!
  return {
    v: 1,
    id: `${endedAt}-${Math.random().toString(36).slice(2, 8)}`,
    endedAt,
    level: s.level,
    botDifficulty: s.botDifficulty,
    mode: s.mode,
    contestants: s.contestants.map((c) => ({ id: c.id, name: c.name, score: c.score })),
    earnings: human.score,
    place: 1 + s.contestants.filter((c) => c.score > human.score).length,
    won: !!s.winners?.includes('human'),
    correct: s.tally.correct,
    wrong: s.tally.wrong,
  }
}

/** Start of the period containing `now`, in local time. Weeks start on Sunday. */
export function periodStart(period: Period, now: Date): number {
  if (period === 'all') return -Infinity
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (period === 'week') d.setDate(d.getDate() - d.getDay())
  if (period === 'month') d.setDate(1)
  return d.getTime()
}

export function summarize(records: GameRecord[], from = -Infinity): Summary {
  const sum: Summary = { games: 0, wins: 0, earnings: 0, correct: 0, wrong: 0, best: null }
  for (const r of records) {
    if (r.endedAt < from) continue
    sum.games += 1
    if (r.won) sum.wins += 1
    sum.earnings += r.earnings
    sum.correct += r.correct
    sum.wrong += r.wrong
    sum.best = sum.best === null ? r.earnings : Math.max(sum.best, r.earnings)
  }
  return sum
}

export function loadHistory(): GameRecord[] {
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw ? (JSON.parse(raw) as GameRecord[]) : []
    return Array.isArray(list) ? list.filter((r) => r && r.v === 1) : []
  } catch {
    return []
  }
}

/** Newest first. */
export function addRecord(r: GameRecord) {
  try {
    const list = [r, ...loadHistory().filter((x) => x.id !== r.id)].slice(0, MAX_RECORDS)
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* storage full or unavailable: the game still worked, it just isn't kept */
  }
}

export function clearHistory() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
