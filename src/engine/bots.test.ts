import { describe, expect, it } from 'vitest'
import { BOT_NAMES, dailyDoubleWager, dealBotNames, finalWager, knowChance } from './bots'
import { seeded } from './rng'

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

describe('dealBotNames', () => {
  it('deals two distinct names from the pool', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const [a, b] = dealBotNames(seeded(seed), 'You')
      expect(a).not.toBe(b)
      expect(BOT_NAMES).toContain(a)
      expect(BOT_NAMES).toContain(b)
    }
  })

  it('never gives a Bot the Human’s name, ignoring case and spaces', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const names = dealBotNames(seeded(seed), ' ada ')
      expect(names).not.toContain('Ada')
    }
  })

  it('varies between games', () => {
    const pairs = new Set(Array.from({ length: 50 }, (_, i) => dealBotNames(seeded(i + 1), 'You').join('|')))
    expect(pairs.size).toBeGreaterThan(30)
  })

  it('has unique names in the pool', () => {
    expect(new Set(BOT_NAMES.map((n) => n.toLowerCase())).size).toBe(BOT_NAMES.length)
  })
})
