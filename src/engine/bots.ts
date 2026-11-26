import type { BotDifficulty, Board, CellRef, Rng } from './types'
import { pick, randInt, shuffle } from './rng'

interface SkillProfile {
  /** Chance of knowing a Rank 1 Clue. */
  baseKnow: number
  /** Knowledge lost per Rank above 1. */
  perRank: number
  /** Chance of ringing in on a Clue it doesn't know (and so answering wrong). */
  rash: number
  /** Ring-in delay range once the ring-in window opens, ms. */
  ringDelay: [number, number]
  /** Time spent "typing" an Answer, ms. */
  typeDelay: [number, number]
}

export const SKILL: Record<BotDifficulty, SkillProfile> = {
  easy: { baseKnow: 0.5, perRank: 0.09, rash: 0.08, ringDelay: [3500, 12000], typeDelay: [2500, 6000] },
  normal: { baseKnow: 0.72, perRank: 0.08, rash: 0.1, ringDelay: [2000, 8000], typeDelay: [2000, 5000] },
  hard: { baseKnow: 0.9, perRank: 0.07, rash: 0.06, ringDelay: [1000, 5000], typeDelay: [1500, 4000] },
}

export function knowChance(difficulty: BotDifficulty, rank: number): number {
  const s = SKILL[difficulty]
  return Math.max(0.05, s.baseKnow - s.perRank * (rank - 1))
}

export function rollKnows(difficulty: BotDifficulty, rank: number, rng: Rng): boolean {
  return rng() < knowChance(difficulty, rank)
}

/** Delay before ringing in, or null if the Bot stays quiet. */
export function planRingIn(difficulty: BotDifficulty, knows: boolean, rng: Rng): number | null {
  const s = SKILL[difficulty]
  if (!knows && rng() >= s.rash) return null
  return randInt(rng, s.ringDelay[0], s.ringDelay[1])
}

export function typingDelay(difficulty: BotDifficulty, rng: Rng): number {
  const [lo, hi] = SKILL[difficulty].typeDelay
  return randInt(rng, lo, hi)
}

/** Bots work a random Category from the top down. */
export function chooseCell(board: Board, rng: Rng): CellRef {
  const open = board.cells
    .map((col, c) => ({ c, row: col.findIndex((cell) => !cell.played) }))
    .filter((x) => x.row >= 0)
  const { c, row } = pick(rng, open)
  return { col: c, row }
}

function roundTo(n: number, step: number): number {
  return Math.round(n / step) * step
}

/** Daily Double Wager: bolder when the Bot is generally strong at this Rank. */
export function dailyDoubleWager(
  difficulty: BotDifficulty,
  rank: number,
  score: number,
  roundTop: number,
): number {
  const max = Math.max(score, roundTop)
  const confidence = knowChance(difficulty, rank)
  const fraction = Math.min(1, Math.max(0.1, (confidence - 0.3) * 1.5))
  return clamp(roundTo(max * fraction, 100), 5, max)
}

/**
 * Final Round Wager, modelled on common strategy:
 * - Leader covers a doubled second place (or bets 0 if already locked).
 * - A trailer within reach bets just enough to pass the leader; otherwise bets it all.
 */
export function finalWager(score: number, otherScores: number[]): number {
  const rivals = otherScores.filter((s) => s > 0)
  const best = rivals.length ? Math.max(...rivals) : 0
  if (score >= best) {
    if (score > 2 * best) return 0
    return clamp(2 * best - score + 1, 0, score)
  }
  if (2 * score > best) return clamp(best - score + 1, 0, score)
  return score
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

/** Pool the two Bots' names are dealt from each game. */
export const BOT_NAMES: readonly string[] = [
  'Ada', 'Max', 'Ruby', 'Leo', 'Nora', 'Felix', 'Iris', 'Otto', 'Mabel', 'Hugo',
  'June', 'Theo', 'Pearl', 'Milo', 'Hazel', 'Jasper', 'Wren', 'Arlo', 'Cleo', 'Rex',
  'Ivy', 'Gus', 'Stella', 'Ezra', 'Opal', 'Dex', 'Rosa', 'Kip', 'Lola', 'Abe',
  'Priya', 'Kenji', 'Amara', 'Diego', 'Sana', 'Tariq', 'Mei', 'Kofi', 'Lena', 'Omar',
]

/** Two distinct Bot names, never matching the Human's name (case-insensitive). */
export function dealBotNames(rng: Rng, humanName: string): [string, string] {
  const taken = humanName.trim().toLowerCase()
  const [a, b] = shuffle(rng, BOT_NAMES.filter((n) => n.toLowerCase() !== taken))
  return [a, b]
}

export function randomDelay(rng: Rng, lo: number, hi: number): number {
  return randInt(rng, lo, hi)
}
