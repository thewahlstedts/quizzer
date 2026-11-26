import type { Clue } from './types'

const LEADING = /^(?:(?:what|who|where|when)\s+(?:is|are|was|were)\s+)?(?:(?:a|an|the)\s+)?/

export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(LEADING, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

/** How many typos are tolerated for an accepted answer of this (normalized) length. */
export function allowedEdits(length: number): number {
  if (length <= 4) return 0
  if (length <= 8) return 1
  if (length <= 14) return 2
  return 3
}

export interface Judgement {
  correct: boolean
  /** Best similarity, 0..1, against any accepted answer. */
  matchScore: number
}

export function judge(typed: string, clue: Pick<Clue, 'answer' | 'alternates'>): Judgement {
  const guess = normalize(typed)
  if (!guess) return { correct: false, matchScore: 0 }
  let correct = false
  let best = 0
  for (const accepted of [clue.answer, ...clue.alternates]) {
    const target = normalize(accepted)
    if (!target) continue
    const d = levenshtein(guess, target)
    best = Math.max(best, 1 - d / Math.max(guess.length, target.length))
    if (d <= allowedEdits(target.length)) correct = true
  }
  return { correct, matchScore: Math.round(best * 1000) / 1000 }
}
