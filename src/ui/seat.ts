import { createContext, useContext } from 'react'
import type { GameState } from '../engine/game'
import type { Attempt, ContestantId } from '../engine/types'

/** Which Contestant this device plays as. A single-player game's Human is 'human'. */
export const MeContext = createContext<ContestantId>('human')

export function useMe(): ContestantId {
  return useContext(MeContext)
}

export function isBot(state: GameState, id: ContestantId): boolean {
  return state.contestants.find((c) => c.id === id)?.kind === 'bot'
}

/**
 * The avatar style for a Contestant: you always get the star; everyone else is styled by their
 * order among the others. In a single-player game that's exactly Bot 1 and Bot 2.
 */
export function avatarStyle(state: GameState, me: ContestantId, id: ContestantId): { glyph: string; className: string } {
  if (id === me) return { glyph: '★', className: 'avatar-human' }
  const i = state.contestants.filter((c) => c.id !== me).findIndex((c) => c.id === id)
  return i === 0 ? { glyph: '◆', className: 'avatar-bot1' } : { glyph: '●', className: 'avatar-bot2' }
}

/** The other Humans who haven't pressed Continue yet (online games wait for everyone). */
export function waitingOn(state: GameState, me: ContestantId): string[] {
  return state.contestants.filter((c) => c.kind === 'human' && c.id !== me && !state.ready?.includes(c.id)).map((c) => c.name)
}

/** The Answer an open Override vote is about, if there is one. */
export function voteAttempt(state: GameState): Attempt | undefined {
  const v = state.vote
  if (!v) return undefined
  return state.phase.kind === 'finalReveal' ? state.final.answers[v.by] : state.clue?.attempts.find((a) => a.contestant === v.by)
}

/** Names joined for a sentence: "Ann", "Ann and Ben", "Ann, Ben and Cat". */
export function namesList(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
