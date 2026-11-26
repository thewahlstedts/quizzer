import { describe, expect, it } from 'vitest'
import { BANKS } from './index'
import { normalize } from '../engine/matcher'

describe.each([1, 2, 3, 4] as const)('Level %i bank', (level) => {
  const bank = BANKS[level]
  it('declares its level', () => expect(bank.level).toBe(level))
  it('has enough Categories for a full game', () => expect(bank.categories.length).toBeGreaterThanOrEqual(15))
  it('has unique Category names', () => {
    const names = bank.categories.map((c) => normalize(c.name))
    const dupes = names.filter((n, i) => names.indexOf(n) !== i)
    expect(dupes).toEqual([])
  })
  it('never puts a (4+ letter) Answer inside its own Clue', () => {
    const leaks = bank.categories.flatMap((c) =>
      c.clues.filter((q) => {
        const a = normalize(q.answer)
        return a.length >= 4 && ` ${normalize(q.clue)} `.includes(` ${a} `)
      }).map((q) => q.id),
    )
    expect(leaks).toEqual([])
  })
  it('never mentions ages', () => {
    const hits = bank.categories.flatMap((c) =>
      c.clues.filter((q) => /\b\d+\s*years?\s*old\b|\bages?\s+\d/i.test(q.clue)).map((q) => q.id),
    )
    expect(hits).toEqual([])
  })
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
