import { useCallback, useEffect, useRef, useState } from 'react'
import { newGame, step, type GameState, type HumanAction } from '../engine/game'
import type { BotDifficulty, GameMode, Level } from '../engine/types'
import { BANKS } from '../content'
import { play } from './sound'
import { countdownSecond, cuesFor } from './cues'
import { addRecord, recordFromState } from './history'

const rng = Math.random

/** This device's Contestant: a single-player game's Human. */
const ME = 'human'

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
    (a: HumanAction) => {
      if (!ref.current) return
      commit(step(ref.current, { ...a, by: ME, now: Date.now() }, rng))
    },
    [commit],
  )

  const start = useCallback(
    (level: Level, difficulty: BotDifficulty, name: string, mode: GameMode) => {
      ref.current = null
      // Also unlocks Web Audio inside this tap, which iOS requires before any sound plays.
      play('start')
      commit(newGame(BANKS[level], difficulty, rng, name || 'You', mode))
    },
    [commit],
  )

  const quit = useCallback(() => commit(null), [commit])

  useEffect(() => {
    let lastTick: string | null = null
    const id = setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (ref.current) {
        const next = step(ref.current, { type: 'tick', now: t }, rng)
        if (next !== ref.current) commit(next)
        // Countdown: one tick per second for the last few seconds of the Human's timer.
        const s = ref.current
        const sec = s ? countdownSecond(s, t) : null
        const key = sec === null ? null : `${s!.phase.kind}:${'until' in s!.phase ? s!.phase.until : ''}:${sec}`
        if (key !== null && key !== lastTick) play(sec === 1 ? 'tickLast' : 'tick')
        lastTick = key
      }
    }, 100)
    return () => clearInterval(id)
  }, [commit])

  return { state, now, dispatch, start, quit }
}

function cues(prev: GameState, next: GameState) {
  for (const c of cuesFor(prev, next)) play(c)
}
