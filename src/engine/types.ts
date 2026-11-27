export type Level = 1 | 2 | 3 | 4
export type Rank = 1 | 2 | 3 | 4 | 5
export type BotDifficulty = 'easy' | 'normal' | 'hard'

/** How a game paces Ring In: Slow reads longest with the longest window; Instant opens Ring In at once. */
export type GameMode = 'slow' | 'medium' | 'fast' | 'instant'
export const GAME_MODES: GameMode[] = ['slow', 'medium', 'fast', 'instant']

/** Modes saved before the rename (Classic → Slow, Quick → Fast). */
export function normalizeMode(m: unknown): GameMode {
  if (m === 'quick' || m === 'fast') return 'fast'
  if (m === 'instant') return 'instant'
  if (m === 'medium') return 'medium'
  return 'slow'
}
/**
 * A Contestant's id within one game. A single-player game uses 'human', 'bot1' and 'bot2';
 * a game with several Humans uses the ids it was given for them, with Bots filling the
 * remaining seats as 'bot1', 'bot2'.
 */
export type ContestantId = string
export type Rng = () => number

export interface Clue {
  id: string
  rank: Rank
  clue: string
  answer: string
  alternates: string[]
}

export interface Category {
  id: string
  name: string
  clues: Clue[]
}

export interface ClueBank {
  level: Level
  categories: Category[]
}

export interface Contestant {
  id: ContestantId
  name: string
  kind: 'human' | 'bot'
  score: number
}

export interface Cell {
  categoryId: string
  clue: Clue
  value: number
  dailyDouble: boolean
  played: boolean
}

export interface Board {
  categories: { id: string; name: string }[]
  /** cells[column][row]; row 0 is Rank 1 */
  cells: Cell[][]
}

export interface CellRef {
  col: number
  row: number
}

export interface Attempt {
  contestant: ContestantId
  /** What was typed. Bots type the canonical answer when right, '' when wrong. */
  typed: string
  /** What is shown on screen: the Human's text, or a Bot's Masked Answer. */
  display: string
  correct: boolean
  matchScore: number
  delta: number
  overridden?: boolean
}
