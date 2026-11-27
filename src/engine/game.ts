import type {
  Attempt,
  BotDifficulty,
  Board,
  Cell,
  CellRef,
  Clue,
  ClueBank,
  Contestant,
  ContestantId,
  GameMode,
  Level,
  Rng,
} from './types'
import { boardCleared, buildBoard, clueOfRank, dealCategories, topValue } from './board'
import {
  dealBotNames,
  chooseCell,
  clamp,
  dailyDoubleWager,
  finalWager,
  planRingIn,
  randomDelay,
  rollKnows,
  typingDelay,
} from './bots'
import { judge } from './matcher'
import { maskAnswer } from './mask'
import { pick } from './rng'

export const TIMING = {
  /** Selection animation before a Clue's reading time starts (Ring In is ignored). */
  selectMs: 3_000,
  readMs: 10_000,
  ringMs: 30_000,
  answerMs: 60_000,
  finalAnswerMs: 120_000,
  botPickMs: 1_800,
  botWagerMs: 1_500,
}

/** Reading time and Ring In window for a normal Clue. Daily Doubles and the Final Round don't change. */
export function clueTiming(mode: GameMode): { readMs: number; ringMs: number } {
  if (mode === 'instant') return { readMs: 0, ringMs: 15_000 }
  if (mode === 'fast') return { readMs: 2_000, ringMs: 15_000 }
  if (mode === 'medium') return { readMs: 5_000, ringMs: 20_000 }
  return { readMs: TIMING.readMs, ringMs: TIMING.ringMs }
}

export type Phase =
  | { kind: 'board'; botPickAt?: number }
  | { kind: 'reading'; until: number }
  | { kind: 'ringIn'; until: number }
  | { kind: 'answering'; contestant: ContestantId; until: number; windowLeft: number; botAnswerAt?: number }
  | { kind: 'ddWager'; botWagerAt?: number }
  | { kind: 'ddReading'; until: number }
  | { kind: 'ddAnswering'; until: number; botAnswerAt?: number }
  | { kind: 'reveal' }
  | { kind: 'roundIntro' }
  | { kind: 'finalChoose'; botPickAt?: number }
  | { kind: 'finalWager' }
  | { kind: 'finalReading'; until: number }
  | { kind: 'finalAnswering'; until: number }
  | { kind: 'finalReveal' }
  | { kind: 'gameOver' }

export interface ClueState {
  ref: CellRef
  attempts: Attempt[]
  botKnows: Partial<Record<ContestantId, boolean>>
  botRingAt: Partial<Record<ContestantId, number>>
  /** Daily Double only. */
  wager?: number
  correctBy?: ContestantId
}

export interface FinalState {
  options: { id: string; name: string; clue: Clue }[]
  eligible: ContestantId[]
  chooser?: ContestantId
  categoryId?: string
  wagers: Partial<Record<ContestantId, number>>
  answers: Partial<Record<ContestantId, Attempt>>
  botKnows: Partial<Record<ContestantId, boolean>>
  botSubmitAt: Partial<Record<ContestantId, number>>
}

export interface GameState {
  level: Level
  botDifficulty: BotDifficulty
  mode: GameMode
  round: 1 | 2 | 'final'
  contestants: Contestant[]
  board: Board
  nextBoard: Board
  selector: ContestantId
  clue?: ClueState
  final: FinalState
  phase: Phase
  winners?: ContestantId[]
  /** Each Human's judged Answers this game (Overrides move one from wrong to correct). */
  tally: Partial<Record<ContestantId, Tally>>
}

export interface Tally {
  correct: number
  wrong: number
}

/** A Human taking a seat in a game. */
export interface Seat {
  id: ContestantId
  name: string
}

/** Seats in every game; Bots fill the ones Humans don't take. */
export const SEATS = 3
const BOT_IDS: ContestantId[] = ['bot1', 'bot2']

/** Something a Human does; `by` says which Human. */
export type HumanAction =
  | { type: 'select'; ref: CellRef }
  | { type: 'ringIn' }
  | { type: 'submitAnswer'; text: string }
  | { type: 'ddWager'; amount: number }
  | { type: 'continue' }
  | { type: 'override' }
  | { type: 'finalChoose'; categoryId: string }
  | { type: 'finalWager'; amount: number }

export type Action = { type: 'tick'; now: number } | (HumanAction & { by: ContestantId; now: number })

/** Contestant ids in seat order: Humans first, then Bots. */
const ids = (s: GameState): ContestantId[] => s.contestants.map((c) => c.id)
const isBot = (s: GameState, id: ContestantId) => s.contestants.find((c) => c.id === id)?.kind === 'bot'
const isHuman = (s: GameState, id: ContestantId) => s.contestants.find((c) => c.id === id)?.kind === 'human'
const bots = (s: GameState) => s.contestants.filter((c) => c.kind === 'bot').map((c) => c.id)

/**
 * Start a game. `humans` is one name (a single-player game, whose Human has id 'human')
 * or 1–3 Seats; Bots fill the remaining seats.
 */
export function newGame(
  bank: ClueBank,
  botDifficulty: BotDifficulty,
  rng: Rng,
  humans: string | readonly Seat[] = 'You',
  mode: GameMode = 'slow',
): GameState {
  const seats: Seat[] = typeof humans === 'string' ? [{ id: 'human', name: humans }] : [...humans]
  validateSeats(seats)
  const deal = dealCategories(bank, rng)
  const board = buildBoard(deal.round1, 1, rng)
  const nextBoard = buildBoard(deal.round2, 2, rng)
  const botNames = dealBotNames(
    rng,
    seats.map((h) => h.name),
    SEATS - seats.length,
  )
  return {
    level: bank.level,
    botDifficulty,
    mode,
    round: 1,
    contestants: [
      ...seats.map((h): Contestant => ({ id: h.id, name: h.name, kind: 'human', score: 0 })),
      ...botNames.map((name, i): Contestant => ({ id: BOT_IDS[i], name, kind: 'bot', score: 0 })),
    ],
    board,
    nextBoard,
    selector: seats[0].id,
    final: {
      options: deal.finalOptions.map((c) => ({ id: c.id, name: c.name, clue: clueOfRank(c, 5) })),
      eligible: [],
      wagers: {},
      answers: {},
      botKnows: {},
      botSubmitAt: {},
    },
    phase: { kind: 'board' },
    tally: Object.fromEntries(seats.map((h) => [h.id, { correct: 0, wrong: 0 }])),
  }
}

function validateSeats(seats: Seat[]) {
  if (seats.length < 1 || seats.length > SEATS) throw new Error(`A game needs 1–${SEATS} Humans, got ${seats.length}`)
  const seen = new Set<string>()
  for (const { id } of seats) {
    if (!id || seen.has(id) || BOT_IDS.includes(id)) throw new Error(`Invalid or duplicate Human id: "${id}"`)
    seen.add(id)
  }
}

// ---------- selectors ----------

export function contestant(state: GameState, id: ContestantId): Contestant {
  return state.contestants.find((c) => c.id === id)!
}

export function currentCell(state: GameState): Cell | undefined {
  if (!state.clue) return undefined
  const { col, row } = state.clue.ref
  return state.board.cells[col][row]
}

export function finalClue(state: GameState): Clue | undefined {
  return state.final.options.find((o) => o.id === state.final.categoryId)?.clue
}

export function dailyDoubleMax(state: GameState): number {
  const round = state.round === 2 ? 2 : 1
  return Math.max(contestant(state, state.selector).score, topValue(round))
}

/** The Answer `by` (a Human; the single-player Human by default) can Override on this Clue, if any. */
export function overridableAttempt(state: GameState, by: ContestantId = 'human'): Attempt | undefined {
  const a =
    state.phase.kind === 'reveal'
      ? state.clue?.attempts.find((x) => x.contestant === by)
      : state.phase.kind === 'finalReveal'
        ? state.final.answers[by]
        : undefined
  if (!a || a.correct || a.overridden || !a.typed.trim()) return undefined
  return a
}

// ---------- reducer ----------

export function step(prev: GameState, action: Action, rng: Rng): GameState {
  if (action.type === 'tick') return advance(structuredClone(prev), action.now, rng)
  const by = action.by
  // Only a seated Human acts; Bots are driven by ticks.
  if (!isHuman(prev, by)) return prev
  const s = structuredClone(prev)
  switch (action.type) {
    case 'select':
      if (s.phase.kind !== 'board' || s.selector !== by) return prev
      if (s.board.cells[action.ref.col]?.[action.ref.row]?.played !== false) return prev
      return selectCell(s, action.ref, action.now, rng)
    case 'ringIn':
      if (s.phase.kind !== 'ringIn' || hasAttempted(s, by)) return prev
      return startAnswering(s, by, action.now, rng)
    case 'submitAnswer':
      return submitHuman(s, prev, by, action.text, action.now, rng)
    case 'ddWager': {
      if (s.phase.kind !== 'ddWager' || s.selector !== by) return prev
      const amount = clamp(Math.round(action.amount), 5, dailyDoubleMax(s))
      s.clue!.wager = amount
      s.phase = { kind: 'ddReading', until: action.now + TIMING.readMs }
      return s
    }
    case 'continue':
      if (s.phase.kind === 'reveal') return afterClue(s, action.now, rng)
      if (s.phase.kind === 'roundIntro') return startRound2(s, action.now, rng)
      if (s.phase.kind === 'finalReveal') return endGame(s)
      return prev
    case 'override':
      return applyOverride(s, prev, by)
    case 'finalChoose':
      if (s.phase.kind !== 'finalChoose' || s.final.chooser !== by) return prev
      if (!s.final.options.some((o) => o.id === action.categoryId)) return prev
      return chooseFinal(s, action.categoryId, action.now)
    case 'finalWager': {
      if (s.phase.kind !== 'finalWager' || !s.final.eligible.includes(by) || s.final.wagers[by] !== undefined) return prev
      s.final.wagers[by] = clamp(Math.round(action.amount), 0, contestant(s, by).score)
      // The Clue is read once every eligible Contestant has wagered (Bots wager on the Category choice).
      if (s.final.eligible.every((id) => s.final.wagers[id] !== undefined)) {
        s.phase = { kind: 'finalReading', until: action.now + TIMING.readMs }
      }
      return s
    }
  }
}

/** Process every deadline that has passed by `now`. */
function advance(s: GameState, now: number, rng: Rng): GameState {
  for (let i = 0; i < 20; i++) {
    const next = advanceOnce(s, now, rng)
    if (!next) return s
    s = next
  }
  return s
}

function advanceOnce(s: GameState, now: number, rng: Rng): GameState | null {
  const p = s.phase
  switch (p.kind) {
    case 'board':
      if (isBot(s, s.selector)) {
        if (p.botPickAt === undefined) {
          s.phase = { kind: 'board', botPickAt: now + TIMING.botPickMs }
          return null
        }
        if (now >= p.botPickAt) return selectCell(s, chooseCell(s.board, rng), p.botPickAt, rng)
      }
      return null
    case 'reading':
      if (now < p.until) return null
      return openRingIn(s, p.until, clueTiming(s.mode).ringMs, rng)
    case 'ringIn': {
      const ringers = bots(s)
        .filter((id) => !hasAttempted(s, id))
        .map((id) => ({ id, at: s.clue!.botRingAt[id] }))
        .filter((x): x is { id: ContestantId; at: number } => x.at !== undefined && x.at <= now && x.at < p.until)
        .sort((a, b) => a.at - b.at)
      if (ringers.length) return startAnswering(s, ringers[0].id, ringers[0].at, rng)
      if (now >= p.until) {
        s.phase = { kind: 'reveal' }
        return s
      }
      return null
    }
    case 'answering':
      if (p.botAnswerAt !== undefined && now >= p.botAnswerAt) {
        return resolveClueAnswer(s, p.contestant, ...botAnswer(s, p.contestant, rng), p.botAnswerAt, rng)
      }
      if (now >= p.until) return resolveClueAnswer(s, p.contestant, '', '', null, p.until, rng)
      return null
    case 'ddWager':
      if (!isBot(s, s.selector)) return null
      if (p.botWagerAt === undefined) {
        s.phase = { kind: 'ddWager', botWagerAt: now + TIMING.botWagerMs }
        return null
      }
      if (now < p.botWagerAt) return null
      s.clue!.wager = dailyDoubleWager(
        s.botDifficulty,
        currentCell(s)!.clue.rank,
        contestant(s, s.selector).score,
        topValue(s.round === 2 ? 2 : 1),
      )
      s.phase = { kind: 'ddReading', until: p.botWagerAt + TIMING.readMs }
      return s
    case 'ddReading':
      if (now < p.until) return null
      s.phase = {
        kind: 'ddAnswering',
        until: p.until + TIMING.answerMs,
        botAnswerAt: isBot(s, s.selector) ? p.until + typingDelay(s.botDifficulty, rng) : undefined,
      }
      return s
    case 'ddAnswering':
      if (p.botAnswerAt !== undefined && now >= p.botAnswerAt) {
        return resolveDailyDouble(s, ...botAnswer(s, s.selector, rng))
      }
      if (now >= p.until) return resolveDailyDouble(s, '', '', null)
      return null
    case 'finalChoose':
      if (!s.final.chooser || !isBot(s, s.final.chooser)) return null
      if (p.botPickAt === undefined) {
        s.phase = { kind: 'finalChoose', botPickAt: now + TIMING.botPickMs }
        return null
      }
      if (now < p.botPickAt) return null
      return chooseFinal(s, pick(rng, s.final.options).id, p.botPickAt)
    case 'finalReading': {
      if (now < p.until) return null
      const clue = finalClue(s)!
      for (const id of s.final.eligible.filter((x) => isBot(s, x))) {
        s.final.botKnows[id] = rollKnows(s.botDifficulty, clue.rank, rng)
        s.final.botSubmitAt[id] = p.until + randomDelay(rng, 8_000, 45_000)
      }
      s.phase = { kind: 'finalAnswering', until: p.until + TIMING.finalAnswerMs }
      return s
    }
    case 'finalAnswering': {
      let changed = false
      for (const id of s.final.eligible.filter((x) => isBot(s, x))) {
        const at = s.final.botSubmitAt[id]
        if (!s.final.answers[id] && at !== undefined && now >= at) {
          s.final.answers[id] = finalBotAttempt(s, id, rng)
          changed = true
        }
      }
      if (allFinalAnswered(s) || now >= p.until) return finishFinal(s, rng)
      return changed ? s : null
    }
    default:
      return null
  }
}

// ---------- normal Clues ----------

function hasAttempted(s: GameState, id: ContestantId): boolean {
  return !!s.clue?.attempts.some((a) => a.contestant === id)
}

function selectCell(s: GameState, ref: CellRef, now: number, rng: Rng): GameState {
  const cell = s.board.cells[ref.col][ref.row]
  cell.played = true
  s.clue = { ref, attempts: [], botKnows: {}, botRingAt: {} }
  for (const id of bots(s)) s.clue.botKnows[id] = rollKnows(s.botDifficulty, cell.clue.rank, rng)
  s.phase = cell.dailyDouble
    ? // A Bot's Wager waits for the selection animation, so its reading time isn't spent behind it.
      { kind: 'ddWager', botWagerAt: isBot(s, s.selector) ? now + TIMING.selectMs + TIMING.botWagerMs : undefined }
    : { kind: 'reading', until: now + TIMING.selectMs + clueTiming(s.mode).readMs }
  return s
}

function openRingIn(s: GameState, start: number, windowMs: number, rng: Rng): GameState {
  const clue = s.clue!
  clue.botRingAt = {}
  for (const id of bots(s).filter((x) => !hasAttempted(s, x))) {
    const delay = planRingIn(s.botDifficulty, !!clue.botKnows[id], rng)
    if (delay !== null) clue.botRingAt[id] = start + delay
  }
  s.phase = { kind: 'ringIn', until: start + windowMs }
  return s
}

function startAnswering(s: GameState, id: ContestantId, at: number, rng: Rng): GameState {
  const p = s.phase as Extract<Phase, { kind: 'ringIn' }>
  s.phase = {
    kind: 'answering',
    contestant: id,
    until: at + TIMING.answerMs,
    windowLeft: Math.max(0, p.until - at),
    botAnswerAt: isBot(s, id) ? at + typingDelay(s.botDifficulty, rng) : undefined,
  }
  return s
}

/** [typed, display, knows] for a Bot answering the current Clue. */
function botAnswer(s: GameState, id: ContestantId, rng: Rng): [string, string, boolean] {
  const clue = currentCell(s)!.clue
  const knows = !!s.clue!.botKnows[id]
  const masked = maskAnswer(clue.answer, rng)
  // A correct Bot shows its Answer; a wrong one shows the Masked Answer (a length hint).
  return [knows ? clue.answer : '', knows ? clue.answer : masked, knows]
}

function judgeTyped(typed: string, clue: Clue, botKnows: boolean | null) {
  if (botKnows !== null) return { correct: botKnows, matchScore: botKnows ? 1 : 0 }
  return judge(typed, clue)
}

function resolveClueAnswer(
  s: GameState,
  id: ContestantId,
  typed: string,
  display: string,
  botKnows: boolean | null,
  now: number,
  rng: Rng,
): GameState {
  const p = s.phase as Extract<Phase, { kind: 'answering' }>
  const cell = currentCell(s)!
  const { correct, matchScore } = judgeTyped(typed, cell.clue, botKnows)
  const delta = correct ? cell.value : -cell.value
  contestant(s, id).score += delta
  s.clue!.attempts.push({ contestant: id, typed, display, correct, matchScore, delta })
  countHuman(s, id, correct)
  if (correct) {
    s.clue!.correctBy = id
    s.selector = id
    s.phase = { kind: 'reveal' }
    return s
  }
  const everyoneTried = ids(s).every((x) => hasAttempted(s, x))
  if (everyoneTried || p.windowLeft <= 0) {
    s.phase = { kind: 'reveal' }
    return s
  }
  return openRingIn(s, now, p.windowLeft, rng)
}

function submitHuman(s: GameState, prev: GameState, by: ContestantId, text: string, now: number, rng: Rng): GameState {
  const p = s.phase
  if (p.kind === 'answering' && p.contestant === by) {
    return resolveClueAnswer(s, by, text, text, null, now, rng)
  }
  if (p.kind === 'ddAnswering' && s.selector === by) {
    return resolveDailyDouble(s, text, text, null)
  }
  if (p.kind === 'finalAnswering' && s.final.eligible.includes(by) && !s.final.answers[by]) {
    const clue = finalClue(s)!
    const { correct, matchScore } = judge(text, clue)
    s.final.answers[by] = { contestant: by, typed: text, display: text, correct, matchScore, delta: 0 }
    return allFinalAnswered(s) ? finishFinal(s, rng) : s
  }
  return prev
}

// ---------- Daily Double ----------

function resolveDailyDouble(s: GameState, typed: string, display: string, botKnows: boolean | null): GameState {
  const cell = currentCell(s)!
  const id = s.selector
  const wager = s.clue!.wager ?? 0
  const { correct, matchScore } = judgeTyped(typed, cell.clue, botKnows)
  const delta = correct ? wager : -wager
  contestant(s, id).score += delta
  s.clue!.attempts.push({ contestant: id, typed, display, correct, matchScore, delta })
  countHuman(s, id, correct)
  if (correct) s.clue!.correctBy = id
  s.phase = { kind: 'reveal' }
  return s
}

// ---------- between Clues and Rounds ----------

function afterClue(s: GameState, now: number, rng: Rng): GameState {
  s.clue = undefined
  if (!boardCleared(s.board)) {
    s.phase = { kind: 'board' }
    return s
  }
  if (s.round === 1) {
    s.phase = { kind: 'roundIntro' }
    return s
  }
  return startFinal(s, now, rng)
}

/** Lowest score among `among`; Humans win ties over Bots, otherwise random. */
function lowest(s: GameState, among: ContestantId[], rng: Rng): ContestantId {
  const min = Math.min(...among.map((id) => contestant(s, id).score))
  const tied = among.filter((id) => contestant(s, id).score === min)
  const tiedHumans = tied.filter((id) => isHuman(s, id))
  if (tiedHumans.length === 1) return tiedHumans[0]
  return pick(rng, tiedHumans.length ? tiedHumans : tied)
}

function startRound2(s: GameState, _now: number, rng: Rng): GameState {
  s.round = 2
  s.board = s.nextBoard
  s.selector = lowest(s, ids(s), rng)
  s.phase = { kind: 'board' }
  return s
}

// ---------- Final Round ----------

function startFinal(s: GameState, _now: number, rng: Rng): GameState {
  s.round = 'final'
  s.final.eligible = ids(s).filter((id) => contestant(s, id).score > 0)
  if (!s.final.eligible.length) return endGame(s)
  s.final.chooser = lowest(s, s.final.eligible, rng)
  s.phase = { kind: 'finalChoose' }
  return s
}

function chooseFinal(s: GameState, categoryId: string, now: number): GameState {
  s.final.categoryId = categoryId
  for (const id of s.final.eligible.filter((x) => isBot(s, x))) {
    const others = s.final.eligible.filter((x) => x !== id).map((x) => contestant(s, x).score)
    s.final.wagers[id] = finalWager(contestant(s, id).score, others)
  }
  s.phase = s.final.eligible.some((id) => isHuman(s, id))
    ? { kind: 'finalWager' }
    : { kind: 'finalReading', until: now + TIMING.readMs }
  return s
}

function finalBotAttempt(s: GameState, id: ContestantId, rng: Rng): Attempt {
  const clue = finalClue(s)!
  const knows = !!s.final.botKnows[id]
  const masked = maskAnswer(clue.answer, rng)
  return {
    contestant: id,
    typed: knows ? clue.answer : '',
    display: knows ? clue.answer : masked,
    correct: knows,
    matchScore: knows ? 1 : 0,
    delta: 0,
  }
}

function allFinalAnswered(s: GameState): boolean {
  return s.final.eligible.every((id) => !!s.final.answers[id])
}

function finishFinal(s: GameState, rng: Rng): GameState {
  const clue = finalClue(s)!
  for (const id of s.final.eligible) {
    const answer =
      s.final.answers[id] ??
      (s.final.answers[id] = isBot(s, id)
        ? { contestant: id, typed: '', display: maskAnswer(clue.answer, rng), correct: false, matchScore: 0, delta: 0 }
        : { contestant: id, typed: '', display: '', correct: false, matchScore: 0, delta: 0 })
    const wager = s.final.wagers[id] ?? 0
    answer.delta = answer.correct ? wager : -wager
    contestant(s, id).score += answer.delta
    countHuman(s, id, answer.correct)
  }
  s.phase = { kind: 'finalReveal' }
  return s
}

function countHuman(s: GameState, id: ContestantId, correct: boolean) {
  const t = s.tally[id]
  if (!t) return // Bots aren't tallied.
  if (correct) t.correct += 1
  else t.wrong += 1
}

function endGame(s: GameState): GameState {
  const max = Math.max(...s.contestants.map((c) => c.score))
  s.winners = s.contestants.filter((c) => c.score === max).map((c) => c.id)
  s.phase = { kind: 'gameOver' }
  return s
}

// ---------- Override ----------

/** A Human Overrides their own rejected Answer. */
function applyOverride(s: GameState, prev: GameState, by: ContestantId): GameState {
  const target = overridableAttempt(s, by)
  if (!target) return prev
  const stake = Math.abs(target.delta)
  target.correct = true
  target.overridden = true
  const t = s.tally[by]!
  t.correct += 1
  t.wrong -= 1
  target.delta = stake
  contestant(s, by).score += 2 * stake
  if (s.phase.kind === 'reveal' && s.clue && !s.clue.correctBy) {
    s.clue.correctBy = by
    s.selector = by
  }
  return s
}
