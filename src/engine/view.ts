import type { GameState, Phase } from './game'
import type { Board, Clue, ContestantId } from './types'

/**
 * What one Contestant may see of a game: what a player in the studio would know, and no more.
 * A server keeps the full GameState and sends each Human `viewFor(state, theirId)`.
 *
 * Hidden: every Clue not yet picked (its text, Answer and whether it's a Daily Double), Round 2's
 * Board, a Clue's Answer until it's revealed, a Daily Double's Clue until it's wagered on, the
 * Final Clue until it's read and its Answer until the reveal, other Contestants' Final Wagers and
 * Answers until the reveal (you see only that they've answered), and everything about how Bots will play (who knows what, and when they
 * act). Played Clues stay visible.
 *
 * The view is the same shape as GameState, so the UI can render either.
 */
export function viewFor(state: GameState, viewer: ContestantId): GameState {
  const s = structuredClone(state)
  const kind = s.phase.kind
  const cur = s.clue?.ref

  s.board = redactBoard(s.board, (col, row) => {
    // Played Clues other than the current one were revealed already.
    if (!cur || cur.col !== col || cur.row !== row) return 'show'
    if (kind === 'ddWager') return 'hide'
    return kind === 'reveal' ? 'show' : 'textOnly'
  })
  s.nextBoard = redactBoard(s.nextBoard, () => 'hide')
  if (s.clue) {
    s.clue.botKnows = {}
    s.clue.botRingAt = {}
  }
  s.phase = stripBotTimers(s.phase)

  const f = s.final
  const revealed = kind === 'finalReveal' || kind === 'gameOver'
  const read = revealed || kind === 'finalReading' || kind === 'finalAnswering'
  f.options = f.options.map((o) => ({
    ...o,
    clue: o.id === f.categoryId && read ? (revealed ? o.clue : textOnly(o.clue)) : hidden(o.clue),
  }))
  f.botKnows = {}
  f.botSubmitAt = {}
  if (!revealed) {
    f.wagers = pickOwn(f.wagers, viewer)
    // Others' Answers show only that they've answered, as a blank Attempt.
    for (const [id, a] of Object.entries(f.answers)) {
      if (id !== viewer && a) f.answers[id] = { contestant: id, typed: '', display: '', correct: false, matchScore: 0, delta: 0 }
    }
  }
  return s
}

type Visibility = 'show' | 'textOnly' | 'hide'

/** Unplayed Clues are hidden, along with whether they're Daily Doubles; `played` decides the rest. */
function redactBoard(board: Board, played: (col: number, row: number) => Visibility): Board {
  return {
    ...board,
    cells: board.cells.map((column, col) =>
      column.map((cell, row) => {
        if (!cell.played) return { ...cell, dailyDouble: false, clue: hidden(cell.clue) }
        const v = played(col, row)
        if (v === 'show') return cell
        return { ...cell, clue: v === 'textOnly' ? textOnly(cell.clue) : hidden(cell.clue) }
      }),
    ),
  }
}

function hidden(c: Clue): Clue {
  return { id: '', rank: c.rank, clue: '', answer: '', alternates: [] }
}

function textOnly(c: Clue): Clue {
  return { ...c, answer: '', alternates: [] }
}

function pickOwn<T>(m: Partial<Record<ContestantId, T>>, viewer: ContestantId): Partial<Record<ContestantId, T>> {
  return viewer in m ? { [viewer]: m[viewer] } : {}
}

function stripBotTimers(p: Phase): Phase {
  const { botPickAt: _a, botWagerAt: _b, botAnswerAt: _c, ...rest } = p as Phase & {
    botPickAt?: number
    botWagerAt?: number
    botAnswerAt?: number
  }
  return rest as Phase
}
