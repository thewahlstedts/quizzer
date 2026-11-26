import type { GameState } from '../engine/game'
import type { Cue } from './sound'

/** Countdown ticks play for the last this-many seconds of a timer the Human is on. */
export const COUNTDOWN_SECONDS = 5

/**
 * Whole seconds left (1..COUNTDOWN_SECONDS) on a timer the Human is racing, or null. That is the
 * Ring In window until the Human has tried, and the Human's own answering time (normal Clue, Daily
 * Double, Final Round). Bots' answering time doesn't tick.
 */
export function countdownSecond(s: GameState, now: number): number | null {
  const p = s.phase
  let until: number | undefined
  if (p.kind === 'ringIn' && !s.clue?.attempts.some((a) => a.contestant === 'human')) until = p.until
  else if (p.kind === 'answering' && p.contestant === 'human') until = p.until
  else if (p.kind === 'ddAnswering' && s.selector === 'human') until = p.until
  else if (p.kind === 'finalAnswering' && s.final.eligible.includes('human') && !s.final.answers.human) until = p.until
  if (until === undefined) return null
  const left = Math.ceil((until - now) / 1000)
  return left >= 1 && left <= COUNTDOWN_SECONDS ? left : null
}

/** The sound cues for one state change. Pure, so the mapping is testable without audio. */
export function cuesFor(prev: GameState, next: GameState): Cue[] {
  const pk = prev.phase.kind
  const nk = next.phase.kind
  const prevAttempts = prev.clue?.attempts.length ?? 0
  const nextAttempts = next.clue?.attempts.length ?? 0

  // An Answer was judged.
  if (nextAttempts > prevAttempts && next.clue) {
    return [next.clue.attempts[nextAttempts - 1].correct ? 'correct' : 'wrong']
  }
  // A Clue was picked (by anyone); a Daily Double adds its fanfare as the card flips.
  if (pk === 'board' && (nk === 'reading' || nk === 'ddWager')) {
    return nk === 'ddWager' ? ['select', 'dailyDouble'] : ['select']
  }
  if (pk === 'reading' && nk === 'ringIn') return ['ringOpen']
  if (nk === 'answering' && pk !== 'answering') return [next.phase.kind === 'answering' && next.phase.contestant === 'human' ? 'ring' : 'botRing']
  if ((pk === 'ddWager' && nk === 'ddReading') || (pk === 'finalWager' && nk === 'finalReading')) return ['lock']
  if (nk === 'reveal' && pk === 'ringIn') return ['timeup']
  if (nk === 'roundIntro' && pk !== 'roundIntro') return ['roundIntro']
  if (nk === 'finalReveal' && pk !== 'finalReveal') return ['reveal']
  if (nk === 'gameOver' && pk !== 'gameOver') return [next.winners?.includes('human') ? 'win' : 'lose']
  return []
}
