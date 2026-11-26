import { describe, expect, it } from 'vitest'
import { dailyDoubleWager, finalWager, knowChance } from './bots'

describe('knowChance', () => {
  it('falls with Rank and rises with difficulty', () => {
    expect(knowChance('normal', 1)).toBeGreaterThan(knowChance('normal', 5))
    expect(knowChance('hard', 3)).toBeGreaterThan(knowChance('easy', 3))
  })
})

describe('finalWager', () => {
  it('leader with a lock bets 0', () => expect(finalWager(10000, [4000])).toBe(0))
  it('leader covers a doubled second place', () => expect(finalWager(6000, [4000])).toBe(2001))
  it('close trailer bets just enough to pass', () => expect(finalWager(4000, [6000])).toBe(2001))
  it('far trailer bets it all', () => expect(finalWager(2000, [6000])).toBe(2000))
  it('never exceeds score', () => expect(finalWager(500, [400])).toBeLessThanOrEqual(500))
})

describe('dailyDoubleWager', () => {
  it('stays within 5..max(score, top value)', () => {
    for (const d of ['easy', 'normal', 'hard'] as const) {
      for (const rank of [2, 3, 4, 5]) {
        const w = dailyDoubleWager(d, rank, -400, 1000)
        expect(w).toBeGreaterThanOrEqual(5)
        expect(w).toBeLessThanOrEqual(1000)
      }
    }
  })
})
