import { useCallback, useEffect, useRef, useState } from 'react'
import { newGame, step, type Action, type GameState } from '../engine/game'
import type { BotDifficulty, GameMode, Level } from '../engine/types'
import { BANKS } from '../content'
import { play } from './sound'
import { addRecord, recordFromState } from './history'

type Payload = Action extends infer A ? (A extends { now: number } ? Omit<A, 'now'> : never) : never

const rng = Math.random

export function useGame() {
  const [state, setState] = useState<GameState | null>(null)
  const ref = useRef<GameState | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const commit = useCallback((next: GameState | null) => {
    const prev = ref.current
    ref.current = next
    if (prev && next && prev !== next) cues(prev, next)
    // Record a finished game once, as it reaches Game Over (quit games aren't recorded).
    if (next?.phase.kind === 'gameOver' && prev?.phase.kind !== 'gameOver') addRecord(recordFromState(next, Date.now()))
    setState(next)
  }, [])

  const dispatch = useCallback(
    (a: Payload) => {
      if (!ref.current) return
      commit(step(ref.current, { ...a, now: Date.now() } as Action, rng))
    },
    [commit],
  )

  const start = useCallback(
    (level: Level, difficulty: BotDifficulty, name: string, mode: GameMode) => {
      ref.current = null
      commit(newGame(BANKS[level], difficulty, rng, name || 'You', mode))
    },
    [commit],
  )

  const quit = useCallback(() => commit(null), [commit])

  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (ref.current) {
        const next = step(ref.current, { type: 'tick', now: t }, rng)
        if (next !== ref.current) commit(next)
      }
    }, 100)
    return () => clearInterval(id)
  }, [commit])

  return { state, now, dispatch, start, quit }
}

function cues(prev: GameState, next: GameState) {
  const pk = prev.phase.kind
  const nk = next.phase.kind
  const prevAttempts = prev.clue?.attempts.length ?? 0
  const nextAttempts = next.clue?.attempts.length ?? 0
  if (nextAttempts > prevAttempts && next.clue) {
    play(next.clue.attempts[nextAttempts - 1].correct ? 'correct' : 'wrong')
    return
  }
  if (nk === 'answering' && pk !== 'answering') play('ring')
  else if (nk === 'ddWager' && pk !== 'ddWager') play('dailyDouble')
  else if (nk === 'reveal' && pk === 'ringIn' && nextAttempts === prevAttempts) play('timeup')
  else if (nk === 'finalReveal' && pk !== 'finalReveal') play('reveal')
}
