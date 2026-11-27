import { describe, expect, it } from 'vitest'
import { finalClue, newGame, step, TIMING, type Action, type GameState } from './game'
import { seeded } from './rng'
import { viewFor } from './view'
import { BANKS } from '../content'

const READ = TIMING.selectMs + TIMING.readMs
const SEATS = [
  { id: 'ann', name: 'Ann' },
  { id: 'ben', name: 'Ben' },
]

function game(seed = 1) {
  const rng = seeded(seed)
  let s = newGame(BANKS[1], 'normal', rng, SEATS)
  return {
    get: () => s,
    set: (n: GameState) => (s = n),
    dispatch: (a: Action) => (s = step(s, a, rng)),
  }
}

function cellOf(s: GameState, dd: boolean) {
  for (let col = 0; col < 6; col++)
    for (let row = 0; row < 5; row++) if (s.board.cells[col][row].dailyDouble === dd) return { col, row }
  throw new Error('none')
}

/** Every Clue text and Answer in `s` that the view must not contain. */
function secretsOf(s: GameState, except?: { col: number; row: number }) {
  const out: string[] = []
  const add = (clue: { clue: string; answer: string }) => out.push(clue.clue, `"answer":${JSON.stringify(clue.answer)}`)
  s.board.cells.forEach((column, col) =>
    column.forEach((cell, row) => {
      if (!cell.played && !(except && except.col === col && except.row === row)) add(cell.clue)
    }),
  )
  s.nextBoard.cells.flat().forEach((c) => add(c.clue))
  return out
}

describe('viewFor', () => {
  it('hides every unpicked Clue, its Answer and whether it is a Daily Double, and all of Round 2', () => {
    const s = game().get()
    const v = viewFor(s, 'ann')
    const json = JSON.stringify(v)
    for (const secret of secretsOf(s)) expect(json).not.toContain(secret)
    expect(v.board.cells.flat().some((c) => c.dailyDouble)).toBe(false)
    expect(v.board.categories).toEqual(s.board.categories)
    expect(v.board.cells[0][0].value).toBe(s.board.cells[0][0].value)
  })

  it('does not change the game it is given', () => {
    const s = game().get()
    const before = structuredClone(s)
    viewFor(s, 'ann')
    expect(s).toEqual(before)
  })

  it('shows a picked Clue but not its Answer until the reveal, and nothing about the Bots', () => {
    const g = game()
    const ref = cellOf(g.get(), false)
    g.dispatch({ type: 'select', ref, by: 'ann', now: 0 })
    g.dispatch({ type: 'tick', now: READ })
    const s = g.get()
    expect(s.phase.kind).toBe('ringIn')
    const v = viewFor(s, 'ben')
    const cell = v.board.cells[ref.col][ref.row]
    expect(cell.clue.clue).toBe(s.board.cells[ref.col][ref.row].clue.clue)
    expect(cell.clue.id).toBe(s.board.cells[ref.col][ref.row].clue.id)
    expect(cell.clue.answer).toBe('')
    expect(cell.clue.alternates).toEqual([])
    expect(v.clue!.botKnows).toEqual({})
    expect(v.clue!.botRingAt).toEqual({})
    const json = JSON.stringify(v)
    for (const secret of secretsOf(s, ref)) expect(json).not.toContain(secret)

    const revealed = structuredClone(s)
    revealed.phase = { kind: 'reveal' }
    expect(viewFor(revealed, 'ben').board.cells[ref.col][ref.row].clue).toEqual(s.board.cells[ref.col][ref.row].clue)
  })

  it('keeps Clues played earlier visible', () => {
    const g = game()
    const ref = cellOf(g.get(), false)
    g.dispatch({ type: 'select', ref, by: 'ann', now: 0 })
    const s = structuredClone(g.get())
    s.clue = undefined
    s.phase = { kind: 'board' }
    expect(viewFor(s, 'ann').board.cells[ref.col][ref.row].clue).toEqual(s.board.cells[ref.col][ref.row].clue)
  })

  it('hides a Daily Double Clue until it has been wagered on', () => {
    const g = game(5)
    const ref = cellOf(g.get(), true)
    g.dispatch({ type: 'select', ref, by: 'ann', now: 0 })
    expect(g.get().phase.kind).toBe('ddWager')
    const during = viewFor(g.get(), 'ann').board.cells[ref.col][ref.row]
    expect(during.dailyDouble).toBe(true)
    expect(during.clue.clue).toBe('')
    g.dispatch({ type: 'ddWager', amount: 500, by: 'ann', now: 100 })
    const after = viewFor(g.get(), 'ann').board.cells[ref.col][ref.row].clue
    expect(after.clue).toBe(g.get().board.cells[ref.col][ref.row].clue.clue)
    expect(after.answer).toBe('')
  })

  it("removes the Bots' timers from the phase", () => {
    const s = game().get()
    s.selector = 'bot1'
    s.phase = { kind: 'board', botPickAt: 1234 }
    expect(viewFor(s, 'ann').phase).toEqual({ kind: 'board' })
  })

  describe('Final Round', () => {
    function atFinal() {
      const g = game(9)
      const s = structuredClone(g.get())
      s.round = 2
      s.board.cells.forEach((col) => col.forEach((c) => (c.played = true)))
      s.contestants.forEach((c, i) => (c.score = [1000, 2000, 3000][i]))
      s.phase = { kind: 'reveal' }
      s.clue = { ref: { col: 0, row: 0 }, attempts: [], botKnows: {}, botRingAt: {} }
      g.set(s)
      g.dispatch({ type: 'continue', by: 'ann', now: 0 })
      g.dispatch({ type: 'continue', by: 'ben', now: 0 })
      return g
    }

    it("hides the Clue until it's read, the Answer until the reveal, and others' Wagers and Answers", () => {
      const g = atFinal()
      g.dispatch({ type: 'finalChoose', categoryId: g.get().final.options[0].id, by: 'ann', now: 0 })
      const clue = finalClue(g.get())!
      // The Bot wagered on the Category choice; only your own Wager shows.
      g.dispatch({ type: 'finalWager', amount: 500, by: 'ann', now: 0 })
      let v = viewFor(g.get(), 'ann')
      expect(v.final.options.every((o) => o.clue.clue === '' && o.clue.answer === '')).toBe(true)
      expect(v.final.wagers).toEqual({ ann: 500 })
      expect(v.final.options.map((o) => o.name)).toEqual(g.get().final.options.map((o) => o.name))

      g.dispatch({ type: 'finalWager', amount: 1000, by: 'ben', now: 0 })
      g.dispatch({ type: 'tick', now: TIMING.readMs })
      expect(g.get().phase.kind).toBe('finalAnswering')
      g.dispatch({ type: 'submitAnswer', text: clue.answer, by: 'ben', now: TIMING.readMs + 1 })
      v = viewFor(g.get(), 'ann')
      const shown = v.final.options.find((o) => o.id === g.get().final.categoryId)!.clue
      expect(shown.clue).toBe(clue.clue)
      expect(shown.answer).toBe('')
      expect(v.final.options.filter((o) => o.clue.clue !== '')).toHaveLength(1)
      // Ann sees that Ben has answered, but not what or whether he was right.
      expect(v.final.answers).toEqual({ ben: { contestant: 'ben', typed: '', display: '', correct: false, matchScore: 0, delta: 0 } })
      expect(JSON.stringify(v.final.answers)).not.toContain(clue.answer)
      expect(v.final.botKnows).toEqual({})
      expect(v.final.botSubmitAt).toEqual({})
      expect(viewFor(g.get(), 'ben').final.answers.ben!.typed).toBe(clue.answer)

      g.dispatch({ type: 'submitAnswer', text: 'zzzz', by: 'ann', now: TIMING.readMs + 2 })
      g.dispatch({ type: 'tick', now: TIMING.readMs + 60_000 })
      expect(g.get().phase.kind).toBe('finalReveal')
      v = viewFor(g.get(), 'ann')
      expect(v.final.wagers).toEqual(g.get().final.wagers)
      expect(v.final.answers).toEqual(g.get().final.answers)
      expect(v.final.options.find((o) => o.id === g.get().final.categoryId)!.clue).toEqual(clue)
    })
  })
})
