import { describe, expect, it } from 'vitest'
import { clueTiming, contestant, currentCell, finalClue, newGame, step, TIMING, type Action, type GameState } from './game'
import { seeded } from './rng'
import type { ClueBank, GameMode } from './types'
import { BANKS } from '../content'

/** Time from selecting a normal Clue to the ring-in window opening. */
const READ = TIMING.selectMs + TIMING.readMs

function setup(seed = 1, bank: ClueBank = BANKS[1], mode: GameMode = 'classic') {
  const rng = seeded(seed)
  let s = newGame(bank, 'normal', rng, 'You', mode)
  const dispatch = (a: Action) => (s = step(s, a, rng))
  return { get: () => s, set: (n: GameState) => (s = n), dispatch, rng }
}

/** Make Bots silent so tests control the Clue. */
function silenceBots(s: GameState) {
  s.clue!.botKnows = { bot1: false, bot2: false }
  s.clue!.botRingAt = {}
}

function firstNormalCell(s: GameState) {
  for (let col = 0; col < 6; col++)
    for (let row = 0; row < 5; row++) if (!s.board.cells[col][row].dailyDouble && !s.board.cells[col][row].played) return { col, row }
  throw new Error('none')
}

describe('normal Clue', () => {
  it('ignores ringing in during reading, then lets the Human ring in and score', () => {
    const g = setup()
    const ref = firstNormalCell(g.get())
    g.dispatch({ type: 'select', ref, now: 0 })
    expect(g.get().phase.kind).toBe('reading')
    g.dispatch({ type: 'ringIn', now: 1000 })
    expect(g.get().phase.kind).toBe('reading')
    g.dispatch({ type: 'tick', now: READ })
    expect(g.get().phase.kind).toBe('ringIn')
    // stop bots from ringing in
    const s = structuredClone(g.get())
    s.clue!.botRingAt = {}
    g.set(s)
    g.dispatch({ type: 'ringIn', now: READ + 500 })
    expect(g.get().phase.kind).toBe('answering')
    const cell = currentCell(g.get())!
    g.dispatch({ type: 'submitAnswer', text: cell.clue.answer, now: READ + 3000 })
    expect(g.get().phase.kind).toBe('reveal')
    expect(contestant(g.get(), 'human').score).toBe(cell.value)
    expect(g.get().selector).toBe('human')
    expect(g.get().tally).toEqual({ correct: 1, wrong: 0 })
  })

  it('deducts on a wrong Answer, resumes the remaining window, and allows an Override', () => {
    const g = setup(2)
    const ref = firstNormalCell(g.get())
    g.dispatch({ type: 'select', ref, now: 0 })
    g.dispatch({ type: 'tick', now: READ })
    const s = structuredClone(g.get())
    silenceBots(s)
    g.set(s)
    g.dispatch({ type: 'ringIn', now: READ + 10_000 })
    g.dispatch({ type: 'submitAnswer', text: 'zzzz nonsense', now: READ + 15_000 })
    const value = currentCell(g.get())!.value
    expect(contestant(g.get(), 'human').score).toBe(-value)
    expect(g.get().tally).toEqual({ correct: 0, wrong: 1 })
    const p = g.get().phase
    expect(p.kind).toBe('ringIn')
    if (p.kind === 'ringIn') expect(p.until).toBe(READ + 15_000 + 20_000)
    // human can't ring in twice
    g.dispatch({ type: 'ringIn', now: READ + 16_000 })
    expect(g.get().phase.kind).toBe('ringIn')
    // window expires -> reveal
    g.dispatch({ type: 'tick', now: READ + 40_000 })
    expect(g.get().phase.kind).toBe('reveal')
    g.dispatch({ type: 'override', now: 0 })
    expect(contestant(g.get(), 'human').score).toBe(value)
    expect(g.get().selector).toBe('human')
    expect(g.get().tally).toEqual({ correct: 1, wrong: 0 })
    // only once
    g.dispatch({ type: 'override', now: 0 })
    expect(contestant(g.get(), 'human').score).toBe(value)
    expect(g.get().tally).toEqual({ correct: 1, wrong: 0 })
  })

  it('times out an unanswered ring-in as wrong', () => {
    const g = setup(3)
    g.dispatch({ type: 'select', ref: firstNormalCell(g.get()), now: 0 })
    g.dispatch({ type: 'tick', now: READ })
    const s = structuredClone(g.get())
    silenceBots(s)
    g.set(s)
    g.dispatch({ type: 'ringIn', now: READ })
    g.dispatch({ type: 'tick', now: READ + TIMING.answerMs })
    expect(contestant(g.get(), 'human').score).toBeLessThan(0)
  })

  it('reveals after 30s if nobody rings in', () => {
    const g = setup(4)
    g.dispatch({ type: 'select', ref: firstNormalCell(g.get()), now: 0 })
    g.dispatch({ type: 'tick', now: READ })
    const s = structuredClone(g.get())
    silenceBots(s)
    g.set(s)
    g.dispatch({ type: 'tick', now: READ + TIMING.ringMs })
    expect(g.get().phase.kind).toBe('reveal')
    expect(g.get().contestants.every((c) => c.score === 0)).toBe(true)
  })
})

describe('Bot Answers', () => {
  function botAnswers(knows: boolean) {
    const g = setup(2)
    g.dispatch({ type: 'select', ref: firstNormalCell(g.get()), now: 0 })
    g.dispatch({ type: 'tick', now: READ })
    const s = structuredClone(g.get())
    s.clue!.botKnows = { bot1: knows, bot2: false }
    s.clue!.botRingAt = { bot1: READ + 100 }
    g.set(s)
    g.dispatch({ type: 'tick', now: READ + 100 })
    expect(g.get().phase.kind).toBe('answering')
    g.dispatch({ type: 'tick', now: READ + 100 + TIMING.answerMs })
    const a = g.get().clue!.attempts.find((x) => x.contestant === 'bot1')!
    return { a, answer: currentCell(g.get())!.clue.answer }
  }

  it('shows a correct Bot Answer in full', () => {
    const { a, answer } = botAnswers(true)
    expect(a.correct).toBe(true)
    expect(a.display).toBe(answer)
  })

  it('shows a wrong Bot Answer as asterisks', () => {
    const { a } = botAnswers(false)
    expect(a.correct).toBe(false)
    expect(a.display).toMatch(/^[* ]+$/)
  })
})

describe('Quick mode', () => {
  it('opens Ring In as soon as the selection animation ends', () => {
    const g = setup(1, BANKS[1], 'quick')
    g.dispatch({ type: 'select', ref: firstNormalCell(g.get()), now: 0 })
    g.dispatch({ type: 'tick', now: TIMING.selectMs - 1 })
    expect(g.get().phase.kind).toBe('reading')
    g.dispatch({ type: 'tick', now: TIMING.selectMs })
    expect(g.get().phase.kind).toBe('ringIn')
    const s = structuredClone(g.get())
    silenceBots(s)
    g.set(s)
    g.dispatch({ type: 'ringIn', now: TIMING.selectMs + 100 })
    expect(g.get().phase.kind).toBe('answering')
  })

  it('reveals after 15s if nobody rings in', () => {
    const g = setup(4, BANKS[1], 'quick')
    g.dispatch({ type: 'select', ref: firstNormalCell(g.get()), now: 0 })
    g.dispatch({ type: 'tick', now: TIMING.selectMs })
    const s = structuredClone(g.get())
    silenceBots(s)
    g.set(s)
    g.dispatch({ type: 'tick', now: TIMING.selectMs + 15_000 - 1 })
    expect(g.get().phase.kind).toBe('ringIn')
    g.dispatch({ type: 'tick', now: TIMING.selectMs + 15_000 })
    expect(g.get().phase.kind).toBe('reveal')
  })

  it('leaves Classic timing unchanged', () => {
    expect(clueTiming('classic')).toEqual({ readMs: TIMING.readMs, ringMs: TIMING.ringMs })
    expect(clueTiming('quick')).toEqual({ readMs: 0, ringMs: 15_000 })
  })

  it.each([1, 2, 3, 4])('a whole Quick game terminates (seed %i)', (seed) => {
    expect(autoplay(seed, 1, 'quick').phase.kind).toBe('gameOver')
  })
})

describe('Daily Double', () => {
  it('clamps the Wager and only the selector answers', () => {
    const g = setup(5)
    const s0 = g.get()
    let ref = { col: 0, row: 0 }
    s0.board.cells.forEach((col, c) => col.forEach((cell, r) => cell.dailyDouble && (ref = { col: c, row: r })))
    g.dispatch({ type: 'select', ref, now: 0 })
    expect(g.get().phase.kind).toBe('ddWager')
    g.dispatch({ type: 'ddWager', amount: 99999, now: 0 })
    expect(g.get().clue!.wager).toBe(1000)
    g.dispatch({ type: 'tick', now: READ })
    expect(g.get().phase.kind).toBe('ddAnswering')
    g.dispatch({ type: 'submitAnswer', text: currentCell(g.get())!.clue.answer, now: READ + 1 })
    expect(contestant(g.get(), 'human').score).toBe(1000)
  })

  it('makes a Bot wait out the selection animation before Wagering', () => {
    const g = setup(5)
    const s0 = g.get()
    s0.selector = 'bot1'
    // Leave only the Daily Double unplayed so the Bot must pick it.
    s0.board.cells.forEach((col) => col.forEach((cell) => (cell.played = !cell.dailyDouble)))
    g.dispatch({ type: 'tick', now: 0 })
    g.dispatch({ type: 'tick', now: TIMING.botPickMs })
    expect(g.get().phase.kind).toBe('ddWager')
    const wagerAt = TIMING.botPickMs + TIMING.selectMs + TIMING.botWagerMs
    g.dispatch({ type: 'tick', now: wagerAt - 1 })
    expect(g.get().phase.kind).toBe('ddWager')
    g.dispatch({ type: 'tick', now: wagerAt })
    expect(g.get().phase).toEqual({ kind: 'ddReading', until: wagerAt + TIMING.readMs })
  })
})

/** Drive a whole game with the Human never answering, to check it always terminates. */
function autoplay(seed: number, level: 1 | 2 | 3 | 4, mode: GameMode = 'classic') {
  const g = setup(seed, BANKS[level], mode)
  let now = 0
  for (let i = 0; i < 20000 && g.get().phase.kind !== 'gameOver'; i++) {
    const s = g.get()
    now += 500
    switch (s.phase.kind) {
      case 'board':
        if (s.selector === 'human') {
          g.dispatch({ type: 'select', ref: firstNormalCellOrAny(s), now })
          continue
        }
        break
      case 'ddWager':
        if (s.selector === 'human') {
          g.dispatch({ type: 'ddWager', amount: 5, now })
          continue
        }
        break
      case 'reveal':
      case 'roundIntro':
      case 'finalReveal':
        g.dispatch({ type: 'continue', now })
        continue
      case 'finalChoose':
        if (s.final.chooser === 'human') {
          g.dispatch({ type: 'finalChoose', categoryId: s.final.options[0].id, now })
          continue
        }
        break
      case 'finalWager':
        g.dispatch({ type: 'finalWager', amount: 0, now })
        continue
    }
    g.dispatch({ type: 'tick', now })
  }
  return g.get()
}

function firstNormalCellOrAny(s: GameState) {
  for (let col = 0; col < 6; col++) for (let row = 0; row < 5; row++) if (!s.board.cells[col][row].played) return { col, row }
  throw new Error('board full')
}

describe('full game', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('seed %i terminates with winners', (seed) => {
    const s = autoplay(seed, ((seed % 4) + 1) as 1 | 2 | 3 | 4)
    expect(s.phase.kind).toBe('gameOver')
    expect(s.winners!.length).toBeGreaterThan(0)
    const max = Math.max(...s.contestants.map((c) => c.score))
    expect(s.winners!.every((id) => contestant(s, id).score === max)).toBe(true)
  })
})

describe('Final Round', () => {
  function atFinal(scores: [number, number, number]) {
    const g = setup(9)
    const s = structuredClone(g.get())
    s.round = 2
    s.board.cells.forEach((col) => col.forEach((c) => (c.played = true)))
    s.contestants.forEach((c, i) => (c.score = scores[i]))
    s.phase = { kind: 'reveal' }
    s.clue = { ref: { col: 0, row: 0 }, attempts: [], botKnows: {}, botRingAt: {} }
    g.set(s)
    g.dispatch({ type: 'continue', now: 0 })
    return g
  }

  it('lets the last-place eligible Contestant choose; ineligible Contestants sit out', () => {
    const g = atFinal([-200, 3000, 1000])
    expect(g.get().final.eligible).toEqual(['bot1', 'bot2'])
    expect(g.get().final.chooser).toBe('bot2')
  })

  it('gives the Human the choice on a tie for last', () => {
    expect(atFinal([1000, 1000, 5000]).get().final.chooser).toBe('human')
  })

  it('skips the Final when nobody is eligible', () => {
    const g = atFinal([0, -400, -200])
    expect(g.get().phase.kind).toBe('gameOver')
    expect(g.get().winners).toEqual(['human'])
  })

  it('ends answering early once everyone has submitted, and applies Wagers', () => {
    const g = atFinal([1000, 3000, 2000])
    g.dispatch({ type: 'finalChoose', categoryId: g.get().final.options[1].id, now: 0 })
    g.dispatch({ type: 'finalWager', amount: 800, now: 0 })
    g.dispatch({ type: 'tick', now: READ })
    expect(g.get().phase.kind).toBe('finalAnswering')
    g.dispatch({ type: 'tick', now: READ + 50_000 }) // all bots submitted by 45s
    g.dispatch({ type: 'submitAnswer', text: finalClue(g.get())!.answer, now: READ + 50_001 })
    expect(g.get().phase.kind).toBe('finalReveal')
    expect(contestant(g.get(), 'human').score).toBe(1800)
  })
})
