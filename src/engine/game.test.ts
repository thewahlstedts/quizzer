import { describe, expect, it } from 'vitest'
import { clueTiming, contestant, currentCell, finalClue, newGame, step, TIMING, type Action, type GameState, type HumanAction } from './game'
import { seeded } from './rng'
import { normalizeMode, type ClueBank, type GameMode } from './types'
import { BANKS } from '../content'

/** Time from selecting a normal Clue to the ring-in window opening. */
const READ = TIMING.selectMs + TIMING.readMs

/** An action; a Human's action without `by` is the single-player Human's. */
type Act = Action | (HumanAction & { now: number })
const asAction = (a: Act): Action => (a.type === 'tick' || 'by' in a ? (a as Action) : { ...a, by: 'human' })

function setup(seed = 1, bank: ClueBank = BANKS[1], mode: GameMode = 'slow') {
  const rng = seeded(seed)
  let s = newGame(bank, 'normal', rng, 'You', mode)
  const dispatch = (a: Act) => (s = step(s, asAction(a), rng))
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
    expect(g.get().tally.human).toEqual({ correct: 1, wrong: 0 })
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
    expect(g.get().tally.human).toEqual({ correct: 0, wrong: 1 })
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
    expect(g.get().tally.human).toEqual({ correct: 1, wrong: 0 })
    // only once
    g.dispatch({ type: 'override', now: 0 })
    expect(contestant(g.get(), 'human').score).toBe(value)
    expect(g.get().tally.human).toEqual({ correct: 1, wrong: 0 })
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

describe('Mode', () => {
  it('opens Ring In as soon as the selection animation ends', () => {
    const g = setup(1, BANKS[1], 'instant')
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
    const g = setup(4, BANKS[1], 'instant')
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

  it('times Slow, Medium, Fast and Instant', () => {
    expect(clueTiming('slow')).toEqual({ readMs: TIMING.readMs, ringMs: TIMING.ringMs })
    expect(clueTiming('medium')).toEqual({ readMs: 5_000, ringMs: 20_000 })
    expect(clueTiming('fast')).toEqual({ readMs: 2_000, ringMs: 15_000 })
    expect(clueTiming('instant')).toEqual({ readMs: 0, ringMs: 15_000 })
  })

  it('opens a 20s Ring In window after 5s of reading in Medium', () => {
    const g = setup(4, BANKS[1], 'medium')
    g.dispatch({ type: 'select', ref: firstNormalCell(g.get()), now: 0 })
    g.dispatch({ type: 'tick', now: TIMING.selectMs + 4_999 })
    expect(g.get().phase.kind).toBe('reading')
    g.dispatch({ type: 'tick', now: TIMING.selectMs + 5_000 })
    expect(g.get().phase.kind).toBe('ringIn')
    const s = structuredClone(g.get())
    silenceBots(s)
    g.set(s)
    g.dispatch({ type: 'tick', now: TIMING.selectMs + 25_000 - 1 })
    expect(g.get().phase.kind).toBe('ringIn')
    g.dispatch({ type: 'tick', now: TIMING.selectMs + 25_000 })
    expect(g.get().phase.kind).toBe('reveal')
  })

  it('makes Fast wait 2s before Ring In opens', () => {
    const g = setup(1, BANKS[1], 'fast')
    g.dispatch({ type: 'select', ref: firstNormalCell(g.get()), now: 0 })
    g.dispatch({ type: 'tick', now: TIMING.selectMs + 1_999 })
    expect(g.get().phase.kind).toBe('reading')
    g.dispatch({ type: 'ringIn', now: TIMING.selectMs + 1_000 })
    expect(g.get().phase.kind).toBe('reading')
    g.dispatch({ type: 'tick', now: TIMING.selectMs + 2_000 })
    expect(g.get().phase.kind).toBe('ringIn')
  })

  it('maps Modes saved before the rename', () => {
    expect(normalizeMode('classic')).toBe('slow')
    expect(normalizeMode('quick')).toBe('fast')
    expect(normalizeMode('medium')).toBe('medium')
    expect(normalizeMode('instant')).toBe('instant')
    expect(normalizeMode(null)).toBe('slow')
  })

  it.each([
    [1, 'fast'],
    [2, 'medium'],
    [3, 'instant'],
    [4, 'medium'],
  ] as const)('a whole game terminates (seed %i, %s)', (seed, mode) => {
    expect(autoplay(seed, 1, mode).phase.kind).toBe('gameOver')
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
function autoplay(seed: number, level: 1 | 2 | 3 | 4, mode: GameMode = 'slow') {
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

describe('several Humans', () => {
  const SEATS = [
    { id: 'ann', name: 'Ann' },
    { id: 'ben', name: 'Ben' },
  ]

  function multi(seed = 1, seats = SEATS) {
    const rng = seeded(seed)
    let s = newGame(BANKS[1], 'normal', rng, seats)
    const dispatch = (a: Action) => (s = step(s, a, rng))
    return { get: () => s, set: (n: GameState) => (s = n), dispatch }
  }

  /** Select a normal Clue as `by`, open Ring In, and silence the Bots. */
  function toRingIn(g: ReturnType<typeof multi>, by = 'ann') {
    g.dispatch({ type: 'select', ref: firstNormalCell(g.get()), by, now: 0 })
    g.dispatch({ type: 'tick', now: READ })
    const s = structuredClone(g.get())
    s.clue!.botKnows = {}
    s.clue!.botRingAt = {}
    g.set(s)
  }

  it('seats the Humans first and fills the remaining seats with Bots', () => {
    const s = multi().get()
    expect(s.contestants.map((c) => [c.id, c.kind])).toEqual([
      ['ann', 'human'],
      ['ben', 'human'],
      ['bot1', 'bot'],
    ])
    expect(['Ann', 'Ben']).not.toContain(s.contestants[2].name)
    expect(s.selector).toBe('ann')
    expect(s.tally).toEqual({ ann: { correct: 0, wrong: 0 }, ben: { correct: 0, wrong: 0 } })
    const three = multi(1, [...SEATS, { id: 'cat', name: 'Cat' }]).get()
    expect(three.contestants.every((c) => c.kind === 'human')).toBe(true)
  })

  it('rejects a bad set of Humans', () => {
    const rng = seeded(1)
    expect(() => newGame(BANKS[1], 'normal', rng, [])).toThrow()
    expect(() => newGame(BANKS[1], 'normal', rng, [...SEATS, { id: 'c', name: 'C' }, { id: 'd', name: 'D' }])).toThrow()
    expect(() => newGame(BANKS[1], 'normal', rng, [SEATS[0], SEATS[0]])).toThrow()
    expect(() => newGame(BANKS[1], 'normal', rng, [{ id: 'bot1', name: 'Sneaky' }])).toThrow()
  })

  it('lets only the selecting Human pick, and ignores actions from Bots or strangers', () => {
    const g = multi()
    const ref = firstNormalCell(g.get())
    const before = g.get()
    g.dispatch({ type: 'select', ref, by: 'ben', now: 0 })
    g.dispatch({ type: 'select', ref, by: 'bot1', now: 0 })
    g.dispatch({ type: 'select', ref, by: 'human', now: 0 })
    expect(g.get()).toBe(before)
    g.dispatch({ type: 'select', ref, by: 'ann', now: 0 })
    expect(g.get().phase.kind).toBe('reading')
  })

  it('gives each Human one Ring In per Clue and scores and tallies them separately', () => {
    const g = multi()
    toRingIn(g)
    const cell = currentCell(g.get())!
    // Bots ring in on ticks, never by action.
    const open = g.get()
    g.dispatch({ type: 'ringIn', by: 'bot1', now: READ + 50 })
    expect(g.get()).toBe(open)
    g.dispatch({ type: 'ringIn', by: 'ann', now: READ + 100 })
    expect(g.get().phase).toMatchObject({ kind: 'answering', contestant: 'ann' })
    // Ben can't answer for Ann, or ring in while she's answering.
    const answering = g.get()
    g.dispatch({ type: 'submitAnswer', text: cell.clue.answer, by: 'ben', now: READ + 200 })
    g.dispatch({ type: 'ringIn', by: 'ben', now: READ + 200 })
    expect(g.get()).toBe(answering)
    g.dispatch({ type: 'submitAnswer', text: 'zzzz', by: 'ann', now: READ + 300 })
    expect(g.get().phase.kind).toBe('ringIn')
    g.dispatch({ type: 'ringIn', by: 'ann', now: READ + 400 })
    expect(g.get().phase.kind).toBe('ringIn')
    g.dispatch({ type: 'ringIn', by: 'ben', now: READ + 500 })
    g.dispatch({ type: 'submitAnswer', text: cell.clue.answer, by: 'ben', now: READ + 600 })
    const s = g.get()
    expect(s.phase.kind).toBe('reveal')
    expect(contestant(s, 'ann').score).toBe(-cell.value)
    expect(contestant(s, 'ben').score).toBe(cell.value)
    expect(s.selector).toBe('ben')
    expect(s.tally).toEqual({ ann: { correct: 0, wrong: 1 }, ben: { correct: 1, wrong: 0 } })
  })

  it('reveals once all three Humans have answered wrong', () => {
    const g = multi(1, [...SEATS, { id: 'cat', name: 'Cat' }])
    toRingIn(g)
    let t = READ
    for (const by of ['ann', 'ben', 'cat']) {
      g.dispatch({ type: 'ringIn', by, now: (t += 100) })
      g.dispatch({ type: 'submitAnswer', text: 'zzzz', by, now: (t += 100) })
    }
    expect(g.get().phase.kind).toBe('reveal')
  })

  it('lets a Human Override only their own Answer', () => {
    const g = multi()
    toRingIn(g)
    g.dispatch({ type: 'ringIn', by: 'ann', now: READ + 100 })
    g.dispatch({ type: 'submitAnswer', text: 'close enough', by: 'ann', now: READ + 200 })
    g.dispatch({ type: 'tick', now: READ + 60_000 })
    expect(g.get().phase.kind).toBe('reveal')
    const revealed = g.get()
    g.dispatch({ type: 'override', by: 'ben', now: 0 })
    expect(g.get()).toBe(revealed)
    g.dispatch({ type: 'override', by: 'ann', now: 0 })
    const value = currentCell(g.get())!.value
    expect(contestant(g.get(), 'ann').score).toBe(value)
    expect(g.get().selector).toBe('ann')
    expect(g.get().tally.ann).toEqual({ correct: 1, wrong: 0 })
  })

  it('lets only the selecting Human Wager on a Daily Double', () => {
    const g = multi(5)
    let dd: { col: number; row: number } | undefined
    g.get().board.cells.forEach((col, c) => col.forEach((cell, r) => cell.dailyDouble && (dd ??= { col: c, row: r })))
    g.dispatch({ type: 'select', ref: dd!, by: 'ann', now: 0 })
    expect(g.get().phase.kind).toBe('ddWager')
    g.dispatch({ type: 'ddWager', amount: 500, by: 'ben', now: 100 })
    expect(g.get().phase.kind).toBe('ddWager')
    g.dispatch({ type: 'ddWager', amount: 500, by: 'ann', now: 100 })
    expect(g.get().phase.kind).toBe('ddReading')
  })

  function atFinal(scores: [number, number, number], seed = 9) {
    const g = multi(seed)
    const s = structuredClone(g.get())
    s.round = 2
    s.board.cells.forEach((col) => col.forEach((c) => (c.played = true)))
    s.contestants.forEach((c, i) => (c.score = scores[i]))
    s.phase = { kind: 'reveal' }
    s.clue = { ref: { col: 0, row: 0 }, attempts: [], botKnows: {}, botRingAt: {} }
    g.set(s)
    g.dispatch({ type: 'continue', by: 'ben', now: 0 })
    return g
  }

  it('gives a tie for last to one of the tied Humans, never the Bot', () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(['ann', 'ben']).toContain(atFinal([1000, 1000, 1000], seed).get().final.chooser)
    }
  })

  it('reads the Final Clue only once every eligible Human has wagered', () => {
    const g = atFinal([1000, 2000, 3000])
    expect(g.get().final.chooser).toBe('ann')
    g.dispatch({ type: 'finalChoose', categoryId: g.get().final.options[0].id, by: 'ann', now: 0 })
    g.dispatch({ type: 'finalWager', amount: 500, by: 'ann', now: 0 })
    expect(g.get().phase.kind).toBe('finalWager')
    // A second Wager from the same Human is ignored.
    g.dispatch({ type: 'finalWager', amount: 900, by: 'ann', now: 0 })
    expect(g.get().final.wagers.ann).toBe(500)
    g.dispatch({ type: 'finalWager', amount: 2000, by: 'ben', now: 10 })
    expect(g.get().phase).toEqual({ kind: 'finalReading', until: 10 + TIMING.readMs })
    g.dispatch({ type: 'tick', now: 10 + TIMING.readMs })
    const answer = finalClue(g.get())!.answer
    g.dispatch({ type: 'submitAnswer', text: answer, by: 'ann', now: 20_000 })
    g.dispatch({ type: 'submitAnswer', text: 'zzzz', by: 'ben', now: 20_001 })
    g.dispatch({ type: 'tick', now: 10 + TIMING.readMs + 50_000 }) // the Bot has submitted by 45s
    const s = g.get()
    expect(s.phase.kind).toBe('finalReveal')
    expect(contestant(s, 'ann').score).toBe(1500)
    expect(contestant(s, 'ben').score).toBe(0)
    expect(s.tally.ann).toEqual({ correct: 1, wrong: 0 })
    expect(s.tally.ben).toEqual({ correct: 0, wrong: 1 })
  })

  it.each([1, 2, 3, 4])('seed %i: a game with Humans who never answer terminates', (seed) => {
    const g = multi(seed)
    let now = 0
    for (let i = 0; i < 20000 && g.get().phase.kind !== 'gameOver'; i++) {
      const s = g.get()
      now += 500
      const hs = ['ann', 'ben']
      if (s.phase.kind === 'board' && hs.includes(s.selector))
        g.dispatch({ type: 'select', ref: firstNormalCellOrAny(s), by: s.selector, now })
      else if (s.phase.kind === 'ddWager' && hs.includes(s.selector))
        g.dispatch({ type: 'ddWager', amount: 5, by: s.selector, now })
      else if (['reveal', 'roundIntro', 'finalReveal'].includes(s.phase.kind)) g.dispatch({ type: 'continue', by: 'ben', now })
      else if (s.phase.kind === 'finalChoose' && hs.includes(s.final.chooser!))
        g.dispatch({ type: 'finalChoose', categoryId: s.final.options[0].id, by: s.final.chooser!, now })
      else if (s.phase.kind === 'finalWager') for (const by of hs) g.dispatch({ type: 'finalWager', amount: 0, by, now })
      else g.dispatch({ type: 'tick', now })
    }
    expect(g.get().phase.kind).toBe('gameOver')
  })

  it('skips the Wager step for Humans who are not eligible', () => {
    const g = atFinal([1000, -500, 3000])
    expect(g.get().final.eligible).toEqual(['ann', 'bot1'])
    g.dispatch({ type: 'finalChoose', categoryId: g.get().final.options[0].id, by: 'ann', now: 0 })
    g.dispatch({ type: 'finalWager', amount: 100, by: 'ben', now: 0 })
    expect(g.get().final.wagers.ben).toBeUndefined()
    g.dispatch({ type: 'finalWager', amount: 100, by: 'ann', now: 0 })
    expect(g.get().phase.kind).toBe('finalReading')
  })
})
