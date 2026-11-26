import { describe, expect, it } from 'vitest'
import { newGame } from '../engine/game'
import { seeded } from '../engine/rng'
import { BANKS } from '../content'
import { periodStart, recordFromState, summarize, type GameRecord } from './history'

function rec(endedAt: Date, earnings: number, won: boolean, correct = 0, wrong = 0): GameRecord {
  return {
    v: 1, id: String(+endedAt), endedAt: +endedAt, level: 1, botDifficulty: 'normal', mode: 'classic',
    contestants: [], earnings, place: won ? 1 : 2, won, correct, wrong,
  }
}

describe('periodStart', () => {
  // Wednesday 26 Nov 2026, 15:30 local time
  const now = new Date(2026, 10, 26, 15, 30)
  it('today starts at local midnight', () => {
    expect(new Date(periodStart('today', now))).toEqual(new Date(2026, 10, 26))
  })
  it('the week starts on Sunday', () => {
    expect(new Date(periodStart('week', now))).toEqual(new Date(2026, 10, 22))
  })
  it('a Sunday is the first day of its own week', () => {
    expect(new Date(periodStart('week', new Date(2026, 10, 22, 9)))).toEqual(new Date(2026, 10, 22))
  })
  it('the month starts on the 1st', () => {
    expect(new Date(periodStart('month', now))).toEqual(new Date(2026, 10, 1))
  })
  it('all time has no start', () => {
    expect(periodStart('all', now)).toBe(-Infinity)
  })
})

describe('summarize', () => {
  const now = new Date(2026, 10, 26, 15, 30)
  const records = [
    rec(new Date(2026, 10, 26, 10), 4000, true, 8, 2), // today
    rec(new Date(2026, 10, 24, 20), -600, false, 3, 5), // this week
    rec(new Date(2026, 10, 3, 12), 1200, false, 6, 4), // this month
    rec(new Date(2026, 9, 30, 12), 9000, true, 12, 1), // last month
  ]
  it('sums each period', () => {
    expect(summarize(records, periodStart('today', now))).toEqual({ games: 1, wins: 1, earnings: 4000, correct: 8, wrong: 2, best: 4000 })
    expect(summarize(records, periodStart('week', now))).toMatchObject({ games: 2, wins: 1, earnings: 3400, best: 4000 })
    expect(summarize(records, periodStart('month', now))).toMatchObject({ games: 3, wins: 1, earnings: 4600 })
    expect(summarize(records)).toMatchObject({ games: 4, wins: 2, earnings: 13600, correct: 29, wrong: 12, best: 9000 })
  })
  it('handles no games', () => {
    expect(summarize([], periodStart('today', now))).toEqual({ games: 0, wins: 0, earnings: 0, correct: 0, wrong: 0, best: null })
  })
})

describe('recordFromState', () => {
  it('captures the result, place and tally', () => {
    const s = newGame(BANKS[1], 'hard', seeded(3), 'Sam', 'quick')
    s.contestants[0].score = 2000
    s.contestants[1].score = 5000
    s.contestants[2].score = 2000
    s.winners = ['bot1']
    s.tally = { correct: 5, wrong: 2 }
    const r = recordFromState(s, 1_000)
    expect(r).toMatchObject({ endedAt: 1_000, level: 1, botDifficulty: 'hard', mode: 'quick', earnings: 2000, place: 2, won: false, correct: 5, wrong: 2 })
    expect(r.contestants.map((c) => c.name)[0]).toBe('Sam')
  })
})
