import { categoryAnswerKeys } from '../engine/board'
import type { Category } from '../engine/types'

/**
 * Answers dealt in the last few games (any Level), so the next deal can avoid them. Different
 * Clues with the same Answer feel like the same question.
 */
const KEY = 'quizzer.recentAnswers.v1'
/** How many games back to remember. 300 simulated games at 10 had no repeated Answers. */
export const RECENT_GAMES = 10

export function loadRecentAnswers(): Set<string> {
  return new Set(loadGames().flat())
}

/** Remember the Answers of a game just dealt (its Board Categories and Final options). */
export function rememberDeal(categories: Category[]) {
  const games = [categories.flatMap(categoryAnswerKeys), ...loadGames()].slice(0, RECENT_GAMES)
  try {
    localStorage.setItem(KEY, JSON.stringify(games))
  } catch {
    /* storage unavailable: repeats are only less likely to be avoided */
  }
}

function loadGames(): string[][] {
  try {
    const raw = localStorage.getItem(KEY)
    const games = raw ? JSON.parse(raw) : []
    return Array.isArray(games) ? games.filter(Array.isArray) : []
  } catch {
    return []
  }
}
