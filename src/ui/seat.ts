import { createContext, useContext } from 'react'
import type { GameState } from '../engine/game'
import type { ContestantId } from '../engine/types'

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
