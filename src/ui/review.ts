import type { Clue, Level } from '../engine/types'

export type FlagReason = 'wrong answer' | 'unclear' | 'too easy' | 'too hard' | 'inappropriate' | 'other'
export const FLAG_REASONS: FlagReason[] = ['wrong answer', 'unclear', 'too easy', 'too hard', 'inappropriate', 'other']

export interface OverrideEntry {
  at: string
  level: Level
  clueId: string
  rank: number
  clue: string
  typed: string
  accepted: string[]
  matchScore: number
}

export interface FlagEntry {
  at: string
  level: Level
  clueId: string
  rank: number
  clue: string
  answer: string
  reason: FlagReason
  note?: string
}

export interface ReviewLog {
  overrides: OverrideEntry[]
  flags: FlagEntry[]
}

const KEY = 'quizzer.reviewLog.v1'

export function loadLog(): ReviewLog {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as ReviewLog
  } catch {
    /* ignore corrupt storage */
  }
  return { overrides: [], flags: [] }
}

function save(log: ReviewLog) {
  localStorage.setItem(KEY, JSON.stringify(log))
}

export function logOverride(level: Level, clue: Clue, typed: string, matchScore: number) {
  const log = loadLog()
  log.overrides.push({
    at: new Date().toISOString(),
    level,
    clueId: clue.id,
    rank: clue.rank,
    clue: clue.clue,
    typed,
    accepted: [clue.answer, ...clue.alternates],
    matchScore,
  })
  save(log)
}

export function logFlag(level: Level, clue: Clue, reason: FlagReason, note?: string) {
  const log = loadLog()
  log.flags.push({
    at: new Date().toISOString(),
    level,
    clueId: clue.id,
    rank: clue.rank,
    clue: clue.clue,
    answer: clue.answer,
    reason,
    note: note?.trim() || undefined,
  })
  save(log)
}

export function downloadLog() {
  const blob = new Blob([JSON.stringify(loadLog(), null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `quizzer-review-log-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function clearLog() {
  save({ overrides: [], flags: [] })
}
