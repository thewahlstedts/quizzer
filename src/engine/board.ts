import type { Board, Category, Cell, Clue, ClueBank, Rng } from './types'
import { shuffle } from './rng'

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

/** Randomly deal distinct Categories for both Rounds and the Final Round options. */
export function dealCategories(bank: ClueBank, rng: Rng): GameDeal {
  const needed = CATEGORIES_PER_ROUND * 2 + FINAL_OPTIONS
  if (bank.categories.length < needed) {
    throw new Error(`Level ${bank.level} needs at least ${needed} Categories, has ${bank.categories.length}`)
  }
  const deck = shuffle(rng, bank.categories)
  return {
    round1: deck.slice(0, 6),
    round2: deck.slice(6, 12),
    finalOptions: deck.slice(12, 15),
  }
}

export function boardCleared(board: Board): boolean {
  return board.cells.every((col) => col.every((c) => c.played))
}
