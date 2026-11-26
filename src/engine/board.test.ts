import { describe, expect, it } from 'vitest'
import { buildBoard, categoryAnswerKeys, dealCategories, valueFor, type GameDeal } from './board'
import { seeded } from './rng'
import { BANKS } from '../content'

describe('board', () => {
  it('derives values from Rank and Round', () => {
    expect(valueFor(1, 1)).toBe(200)
    expect(valueFor(5, 1)).toBe(1000)
    expect(valueFor(3, 2)).toBe(1200)
  })
  it('deals 15 distinct Categories', () => {
    const d = dealCategories(BANKS[1], seeded(1))
    const ids = [...d.round1, ...d.round2, ...d.finalOptions].map((c) => c.id)
    expect(new Set(ids).size).toBe(15)
  })
  it('never deals two Categories that share an Answer', () => {
    for (const level of [1, 2, 3, 4] as const) {
      for (let seed = 0; seed < 100; seed++) {
        const keys = dealtKeys(dealCategories(BANKS[level], seeded(seed)))
        expect(new Set(keys).size).toBe(keys.length)
      }
    }
  })
  it("avoids recent games' Answers, across Levels", () => {
    for (let seed = 0; seed < 50; seed++) {
      const rng = seeded(seed)
      // a Level 3 game, then a Level 4 game remembering it (the reported case)
      const first = new Set(dealtKeys(dealCategories(BANKS[3], rng)))
      const second = dealtKeys(dealCategories(BANKS[4], rng, first))
      expect(second.filter((k) => first.has(k))).toEqual([])
    }
  })
  it('still deals a full game when almost everything is to be avoided', () => {
    const all = new Set(BANKS[1].categories.flatMap(categoryAnswerKeys))
    const d = dealCategories(BANKS[1], seeded(1), all)
    expect(new Set([...d.round1, ...d.round2, ...d.finalOptions].map((c) => c.id)).size).toBe(15)
  })
  it('places 1 Daily Double in Round 1 and 2 in Round 2, never in the top row', () => {
    for (let seed = 0; seed < 200; seed++) {
      const rng = seeded(seed)
      const d = dealCategories(BANKS[2], rng)
      for (const round of [1, 2] as const) {
        const b = buildBoard(round === 1 ? d.round1 : d.round2, round, rng)
        const dds = b.cells.flatMap((col, c) => col.map((cell, r) => ({ cell, c, r }))).filter((x) => x.cell.dailyDouble)
        expect(dds.length).toBe(round)
        expect(dds.every((x) => x.r > 0)).toBe(true)
        expect(new Set(dds.map((x) => x.c)).size).toBe(round)
      }
    }
  })
})

function dealtKeys(d: GameDeal): string[] {
  return [...d.round1, ...d.round2, ...d.finalOptions].flatMap(categoryAnswerKeys)
}
