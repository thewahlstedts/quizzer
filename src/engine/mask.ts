import type { Rng } from './types'
import { randInt } from './rng'

/**
 * A Bot's Masked Answer: one asterisk per non-space character of the correct
 * Answer, with spaces placed at random (so word count is not a reliable hint).
 */
export function maskAnswer(answer: string, rng: Rng): string {
  const n = answer.replace(/\s/g, '').length
  if (n <= 1) return '*'.repeat(n)
  const gaps = Math.min(randInt(rng, 0, 2), Math.floor((n - 1) / 2))
  const positions = new Set<number>()
  let guard = 0
  while (positions.size < gaps && guard++ < 50) {
    const p = randInt(rng, 1, n - 1)
    if (!positions.has(p - 1) && !positions.has(p + 1)) positions.add(p)
  }
  let out = ''
  for (let i = 0; i < n; i++) {
    if (positions.has(i)) out += ' '
    out += '*'
  }
  return out
}
