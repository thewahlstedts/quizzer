import type { Board, Category, Cell, Clue, ClueBank, Rng } from './types'
import { shuffle } from './rng'
import { normalize } from './matcher'

/** Two Clues with the same key have essentially the same Answer. */
export function answerKey(answer: string): string {
  return normalize(answer)
}

export function categoryAnswerKeys(category: Category): string[] {
  return category.clues.map((c) => answerKey(c.answer))
}

export const CATEGORIES_PER_ROUND = 6
export const FINAL_OPTIONS = 3
export const RANKS = [1, 2, 3, 4, 5] as const

/** Point value derived from Rank and Round (see ADR 0001). */
export function valueFor(rank: number, round: 1 | 2): number {
  return rank * (round === 1 ? 200 : 400)
}

export function topValue(round: 1 | 2): number {
  return valueFor(5, round)
}

/** Daily Doubles never land in the top row and favour the harder rows. */
const DD_ROW_WEIGHTS = [0, 1, 3, 4, 3]

function weightedRow(rng: Rng): number {
  const total = DD_ROW_WEIGHTS.reduce((a, b) => a + b, 0)
  let r = rng() * total
  for (let i = 0; i < DD_ROW_WEIGHTS.length; i++) {
    r -= DD_ROW_WEIGHTS[i]
    if (r < 0) return i
  }
  return DD_ROW_WEIGHTS.length - 1
}

export function clueOfRank(category: Category, rank: number): Clue {
  const clue = category.clues.find((c) => c.rank === rank)
  if (!clue) throw new Error(`Category ${category.id} has no Rank ${rank} Clue`)
  return clue
}

export function buildBoard(categories: Category[], round: 1 | 2, rng: Rng): Board {
  const dailyDoubles = round === 1 ? 1 : 2
  const ddCols = shuffle(rng, categories.map((_, i) => i)).slice(0, dailyDoubles)
  const ddRowByCol = new Map(ddCols.map((col) => [col, weightedRow(rng)]))
  const cells: Cell[][] = categories.map((cat, col) =>
    RANKS.map((rank, row) => ({
      categoryId: cat.id,
      clue: clueOfRank(cat, rank),
      value: valueFor(rank, round),
      dailyDouble: ddRowByCol.get(col) === row,
      played: false,
    })),
  )
  return { categories: categories.map(({ id, name }) => ({ id, name })), cells }
}

export interface GameDeal {
  round1: Category[]
  round2: Category[]
  finalOptions: Category[]
}

/**
 * Randomly deal distinct Categories for both Rounds and the Final Round options, so that the same
 * Answer doesn't come up twice: no two dealt Categories share an Answer, and Categories whose
 * Answers are in `avoid` (Answers from recent games, any Level) are dealt only when there aren't
 * enough others. If the bank can't satisfy that, it falls back to the least-repeating Categories.
 */
export function dealCategories(bank: ClueBank, rng: Rng, avoid: ReadonlySet<string> = new Set()): GameDeal {
  const needed = CATEGORIES_PER_ROUND * 2 + FINAL_OPTIONS
  if (bank.categories.length < needed) {
    throw new Error(`Level ${bank.level} needs at least ${needed} Categories, has ${bank.categories.length}`)
  }
  // Fewest recently-seen Answers first; the shuffle (and a stable sort) keeps it random among equals.
  const deck = shuffle(rng, bank.categories)
    .map((c) => ({ c, keys: categoryAnswerKeys(c) }))
    .map((x) => ({ ...x, recent: x.keys.filter((k) => avoid.has(k)).length }))
    .sort((a, b) => a.recent - b.recent)
  const chosen: Category[] = []
  const used = new Set<string>()
  // Pass 1: no Answer shared with another dealt Category. Pass 2 (rarely needed): fill the rest.
  for (const strict of [true, false]) {
    for (const x of deck) {
      if (chosen.length === needed) break
      if (chosen.includes(x.c)) continue
      if (strict && x.keys.some((k) => used.has(k))) continue
      chosen.push(x.c)
      x.keys.forEach((k) => used.add(k))
    }
  }
  // The board order shouldn't reveal which Categories were preferred.
  const dealt = shuffle(rng, chosen)
  return {
    round1: dealt.slice(0, 6),
    round2: dealt.slice(6, 12),
    finalOptions: dealt.slice(12, 15),
  }
}

export function boardCleared(board: Board): boolean {
  return board.cells.every((col) => col.every((c) => c.played))
}
