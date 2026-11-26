import { describe, expect, it } from 'vitest'
import { newGame, step, TIMING, type Action, type GameState } from '../engine/game'
import { seeded } from '../engine/rng'
import { BANKS } from '../content'
import { cuesFor } from './cues'

const READ = TIMING.selectMs + TIMING.readMs

function game(seed = 1) {
  const rng = seeded(seed)
  let s = newGame(BANKS[1], 'normal', rng)
  return {
    get: () => s,
    set: (n: GameState) => (s = n),
    /** Apply an action and return the cues it would play. */
    act: (a: Action) => {
      const prev = s
      s = step(s, a, rng)
      return cuesFor(prev, s)
    },
  }
}

function cell(s: GameState, dd: boolean) {
  for (let col = 0; col < 6; col++)
    for (let row = 0; row < 5; row++) if (s.board.cells[col][row].dailyDouble === dd) return { col, row }
  throw new Error('none')
}

function quietBots(s: GameState) {
  const c = structuredClone(s)
  c.clue!.botKnows = { bot1: false, bot2: false }
  c.clue!.botRingAt = {}
  return c
}

describe('cuesFor', () => {
  it('plays select when a Clue is picked, then ringOpen, ring and the verdict', () => {
    const g = game()
    expect(g.act({ type: 'select', ref: cell(g.get(), false), now: 0 })).toEqual(['select'])
    expect(g.act({ type: 'tick', now: READ })).toEqual(['ringOpen'])
    g.set(quietBots(g.get()))
    expect(g.act({ type: 'ringIn', now: READ + 100 })).toEqual(['ring'])
    expect(g.act({ type: 'submitAnswer', text: 'zzzz', now: READ + 200 })).toEqual(['wrong'])
  })

  it('adds the Daily Double fanfare to the pick, and lock on the Wager', () => {
    const g = game(5)
    expect(g.act({ type: 'select', ref: cell(g.get(), true), now: 0 })).toEqual(['select', 'dailyDouble'])
    expect(g.act({ type: 'ddWager', amount: 500, now: 100 })).toEqual(['lock'])
  })

  it('uses a different sound when a Bot rings in', () => {
    const g = game()
    g.act({ type: 'select', ref: cell(g.get(), false), now: 0 })
    g.act({ type: 'tick', now: READ })
    const s = quietBots(g.get())
    s.clue!.botKnows = { bot1: true, bot2: false }
    s.clue!.botRingAt = { bot1: READ + 50 }
    g.set(s)
    expect(g.act({ type: 'tick', now: READ + 50 })).toEqual(['botRing'])
  })

  it('plays timeup when nobody rings in', () => {
    const g = game(4)
    g.act({ type: 'select', ref: cell(g.get(), false), now: 0 })
    g.act({ type: 'tick', now: READ })
    g.set(quietBots(g.get()))
    expect(g.act({ type: 'tick', now: READ + TIMING.ringMs })).toEqual(['timeup'])
  })

  it('plays win or lose at Game Over, and the Round 2 fanfare', () => {
    const s = newGame(BANKS[1], 'normal', seeded(1))
    const over = (winners: GameState['winners']): GameState => ({ ...s, phase: { kind: 'gameOver' }, winners })
    expect(cuesFor({ ...s, phase: { kind: 'finalReveal' } }, over(['human']))).toEqual(['win'])
    expect(cuesFor({ ...s, phase: { kind: 'finalReveal' } }, over(['bot1']))).toEqual(['lose'])
    expect(cuesFor({ ...s, phase: { kind: 'reveal' } }, { ...s, phase: { kind: 'roundIntro' } })).toEqual(['roundIntro'])
  })

  it('is silent when nothing notable changes', () => {
    const s = newGame(BANKS[1], 'normal', seeded(1))
    expect(cuesFor(s, { ...s })).toEqual([])
  })
})
