import { describe, expect, it } from 'vitest'
import { BANKS } from './index'
import { normalize } from '../engine/matcher'

describe.each([1, 2, 3, 4] as const)('Level %i bank', (level) => {
  const bank = BANKS[level]
  it('declares its level', () => expect(bank.level).toBe(level))
  it('has enough Categories for a full game', () => expect(bank.categories.length).toBeGreaterThanOrEqual(15))
  it('has unique ids', () => {
    const ids = bank.categories.flatMap((c) => [c.id, ...c.clues.map((q) => q.id)])
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('has one Clue per Rank 1-5 in each Category, each with an Answer', () => {
    for (const c of bank.categories) {
      expect(c.clues.map((q) => q.rank).sort()).toEqual([1, 2, 3, 4, 5])
      for (const q of c.clues) {
        expect(q.clue.trim(), q.id).not.toBe('')
        expect(normalize(q.answer), q.id).not.toBe('')
        expect(Array.isArray(q.alternates), q.id).toBe(true)
      }
    }
  })
})
