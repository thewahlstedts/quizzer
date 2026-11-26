import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  clueTiming,
  contestant,
  currentCell,
  dailyDoubleMax,
  finalClue,
  overridableAttempt,
  TIMING,
  type GameState,
} from '../engine/game'
import type { Attempt, BotDifficulty, CellRef, Clue, ContestantId, GameMode, Level } from '../engine/types'
import { useGame } from './useGame'
import { clearLog, downloadLog, FLAG_REASONS, loadLog, logFlag, logOverride, type FlagReason } from './review'
import { isMuted, setMuted } from './sound'
import { dismissKeyboard, useKeyboardInput } from './keyboard'
import { money } from './format'
import { loadHistory, summarize } from './history'
import { StatsCard } from './Stats'

type Dispatch = ReturnType<typeof useGame>['dispatch']


export default function App() {
  const game = useGame()
  const [muted, setMutedState] = useState(isMuted())
  const toggleMute = () => {
    setMuted(!muted)
    setMutedState(!muted)
  }

  return (
    <div className="stage">
      <header className="topbar">
        <h1 className="logo">
          Quiz<span>zer</span>
        </h1>
        <div className="topbar-actions">
          {game.state && (
            <span className="round-tag">
              {game.state.round === 'final' ? 'Final Round' : `Round ${game.state.round}`} · Level {game.state.level}
              {game.state.mode === 'quick' ? ' · Quick' : ''}
            </span>
          )}
          <button className="ghost" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>
            {muted ? '🔇' : '🔊'}
          </button>
          {game.state && (
            <button className="ghost" onClick={game.quit}>
              {game.state.phase.kind === 'gameOver' ? 'New game' : 'Quit'}
            </button>
          )}
        </div>
      </header>
      {game.state ? <Game state={game.state} now={game.now} dispatch={game.dispatch} /> : <Setup onStart={game.start} />}
    </div>
  )
}

// ---------------- Setup ----------------

function Setup({ onStart }: { onStart: (level: Level, d: BotDifficulty, name: string, mode: GameMode) => void }) {
  const [level, setLevel] = useState<Level>(() => (Number(localStorage.getItem('quizzer.level')) || 1) as Level)
  const [difficulty, setDifficulty] = useState<BotDifficulty>(
    () => (localStorage.getItem('quizzer.difficulty') as BotDifficulty) || 'normal',
  )
  const [name, setName] = useState(() => localStorage.getItem('quizzer.name') ?? '')
  const [mode, setMode] = useState<GameMode>(() => (localStorage.getItem('quizzer.mode') === 'quick' ? 'quick' : 'classic'))
  const [log, setLog] = useState(loadLog)

  const start = () => {
    localStorage.setItem('quizzer.level', String(level))
    localStorage.setItem('quizzer.difficulty', difficulty)
    localStorage.setItem('quizzer.name', name)
    localStorage.setItem('quizzer.mode', mode)
    onStart(level, difficulty, name.trim(), mode)
  }

  return (
    <main className="setup">
      <section className="setup-card">
        <h2>Ready to play?</h2>

        <label className="field">
          <span>Your name</span>
          <input
            value={name}
            maxLength={16}
            placeholder="You"
            autoComplete="nickname"
            onChange={(e) => {
              setName(e.target.value)
              try {
                localStorage.setItem('quizzer.name', e.target.value)
              } catch {
                // storage unavailable (private mode): the name still works for this game
              }
            }}
          />
        </label>

        <div className="field">
          <span>Level</span>
          <div className="segmented">
            {([1, 2, 3, 4] as Level[]).map((l) => (
              <button key={l} className={l === level ? 'on' : ''} onClick={() => setLevel(l)}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>Bot difficulty</span>
          <div className="segmented">
            {(['easy', 'normal', 'hard'] as BotDifficulty[]).map((d) => (
              <button key={d} className={d === difficulty ? 'on' : ''} onClick={() => setDifficulty(d)}>
                {d[0].toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span>Mode</span>
          <div className="segmented">
            {(['classic', 'quick'] as GameMode[]).map((m) => (
              <button key={m} className={m === mode ? 'on' : ''} onClick={() => setMode(m)}>
                {m === 'classic' ? 'Classic' : 'Quick'}
              </button>
            ))}
          </div>
          <small className="field-note">
            {mode === 'classic' ? '10 seconds to read, then 30 seconds to ring in.' : 'Ring in as soon as the clue appears. 15 seconds to ring in.'}
          </small>
        </div>

        <button className="primary big" onClick={start}>
          Start game
        </button>

        <details className="rules">
          <summary>How to play</summary>
          <ul>
            <li>Pick a clue from the board. In Classic mode you get 10 seconds to read it, then 30 seconds to ring in.</li>
            <li>In Quick mode you can ring in as soon as the clue appears, and you have 15 seconds.</li>
            <li>
              To ring in, press <kbd>Space</kbd> or the ring-in button.
            </li>
            <li>Once you ring in, you have 60 seconds to type your answer. Wrong answers cost you the clue's value.</li>
            <li>When a Bot answers wrong, its answer shows as asterisks, one per letter of the correct answer. That's a hint about how long it is.</li>
            <li>Daily Doubles are hidden. Wager on them and answer alone.</li>
            <li>The Final Round is chosen by whoever's in last place (among players above $0).</li>
          </ul>
        </details>
      </section>

      <StatsCard />

      <section className="review-card">
        <h3>Review log</h3>
        <p>
          {log.flags.length} flagged clue{log.flags.length === 1 ? '' : 's'} · {log.overrides.length} override
          {log.overrides.length === 1 ? '' : 's'}
        </p>
        <div className="row">
          <button className="ghost" onClick={downloadLog} disabled={!log.flags.length && !log.overrides.length}>
            Download review log
          </button>
          <button
            className="ghost danger"
            onClick={() => {
              clearLog()
              setLog(loadLog())
            }}
            disabled={!log.flags.length && !log.overrides.length}
          >
            Clear
          </button>
        </div>
      </section>
    </main>
  )
}

// ---------------- Game ----------------

/**
 * Selection animation, all inside TIMING.selectMs: the chosen tile (and its Category header) is
 * highlighted on the Board, then flies into the Clue card showing the Category, which holds before
 * fading to reveal the Clue.
 */
const HIGHLIGHT_MS = 1_000
/** How long the flying card shows the Category before it starts to fade (from when it appears). */
const FACE_HOLD_MS = 1_600
const FACE_FADE_MS = 400
/** When the Clue screen's meta, timer and ring-in button rise in, from when the card appears. */
const ENTER_DELAY_MS = FACE_HOLD_MS + FACE_FADE_MS / 2

const cellKey = (r: CellRef) => `${r.col}-${r.row}`

function Game({ state, now, dispatch }: { state: GameState; now: number; dispatch: Dispatch }) {
  const p = state.phase
  // Board tile positions, kept fresh so a chosen tile can fly out from where it was.
  const tileRects = useRef(new Map<string, DOMRect>())
  // The Clue just selected: pulse it on the Board, then fly it into the Clue screen.
  const [selection, setSelection] = useState<{ clueId: string; ref: CellRef; at: number } | null>(null)
  const clueId = state.clue ? currentCell(state)!.clue.id : null
  useEffect(() => {
    if (clueId && state.clue && selection?.clueId !== clueId) {
      setSelection({ clueId, ref: state.clue.ref, at: Date.now() })
    }
  }, [clueId]) // eslint-disable-line react-hooks/exhaustive-deps
  const fresh = !!selection && selection.clueId === clueId
  const highlighting =
    (!!clueId && !fresh) || (fresh && (p.kind === 'reading' || p.kind === 'ddWager') && now - selection!.at < HIGHLIGHT_MS)
  const flipFrom = fresh ? tileRects.current.get(cellKey(selection!.ref)) : undefined

  // Space to ring in (when not typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return
      if (state.phase.kind === 'ringIn' || state.phase.kind === 'reading') {
        e.preventDefault()
        dispatch({ type: 'ringIn' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.phase.kind, dispatch])

  let body: React.ReactNode
  switch (p.kind) {
    case 'board':
      body = <BoardView state={state} dispatch={dispatch} rects={tileRects.current} />
      break
    case 'reading':
    case 'ringIn':
    case 'answering':
    case 'ddWager':
    case 'ddReading':
    case 'ddAnswering':
    case 'reveal':
      body = highlighting ? (
        <BoardView state={state} dispatch={dispatch} rects={tileRects.current} chosen={state.clue!.ref} />
      ) : (
        <ClueView key={clueId} state={state} now={now} dispatch={dispatch} flipFrom={flipFrom} />
      )
      break
    case 'roundIntro':
      body = (
        <Interstitial
          title="Round 2"
          lines={['Point values double.', 'Two Daily Doubles are hiding on this board.', 'Whoever is in last place picks first.']}
          action="Let's go"
          onAction={() => dispatch({ type: 'continue' })}
        />
      )
      break
    case 'finalChoose':
    case 'finalWager':
    case 'finalReading':
    case 'finalAnswering':
    case 'finalReveal':
      body = <FinalView state={state} now={now} dispatch={dispatch} />
      break
    case 'gameOver':
      body = <GameOver state={state} />
  }

  return (
    <main className="game">
      <div className="play-area">{body}</div>
      <Podiums state={state} />
    </main>
  )
}

function Podiums({ state }: { state: GameState }) {
  const p = state.phase
  const active: ContestantId | undefined =
    p.kind === 'answering' ? p.contestant : p.kind === 'ddAnswering' || p.kind === 'ddWager' ? state.selector : undefined
  return (
    <div className="podiums">
      {state.contestants.map((c) => (
        <div
          key={c.id}
          className={[
            'podium',
            c.kind,
            c.id,
            active === c.id ? 'active' : '',
            p.kind === 'answering' && p.contestant === c.id ? 'rang' : '',
            p.kind === 'board' && state.selector === c.id ? 'selecting' : '',
            state.winners?.includes(c.id) ? 'winner' : '',
          ].join(' ')}
        >
          <Avatar id={c.id} />
          <div className="podium-name">{c.name}</div>
          <PodiumScore score={c.score} delay={scoreDelay(state, c.id)} />
        </div>
      ))}
    </div>
  )
}

const SCORE_COUNT_MS = 700
/** The Human's score changes once the "Correct!" / "Not quite" stamp has landed. */
const HUMAN_SCORE_DELAY_MS = 900
const FINAL_STEP_MS = 2_200

/**
 * How long a Contestant's podium waits before showing a score change, so the result is revealed
 * first: the Human's verdict, a Bot's typed Answer, or that Contestant's Final Round row.
 */
function scoreDelay(state: GameState, id: ContestantId): number {
  if (state.phase.kind === 'finalReveal') {
    const i = finalRevealOrder(state).indexOf(id)
    return i < 0 ? 0 : i * FINAL_STEP_MS + 600
  }
  const attempts = state.clue?.attempts ?? []
  const last = attempts[attempts.length - 1]
  if (!last || last.contestant !== id || last.overridden) return 0
  // A Bot's score changes once its typed Answer and ✓/✗ badge are showing.
  return id === 'human' ? HUMAN_SCORE_DELAY_MS : BOT_TYPE_MS + 500
}

/** A score that, after `delay`, counts to its new value and floats the change above it. */
function PodiumScore({ score, delay = 0 }: { score: number; delay?: number }) {
  const [shown, setShown] = useState(score)
  const shownRef = useRef(score)
  shownRef.current = shown
  const [delta, setDelta] = useState<{ amount: number; key: number } | null>(null)
  const target = useRef(score)
  useEffect(() => {
    if (target.current === score) return
    target.current = score
    // Count from what is on screen, so a change arriving mid-count (e.g. an Override) continues smoothly.
    const from = shownRef.current
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    const timer = setTimeout(() => {
      setDelta((d) => ({ amount: score - from, key: (d?.key ?? 0) + 1 }))
      if (reduced) {
        setShown(score)
        return
      }
      const start = performance.now()
      frame = requestAnimationFrame(function tick(t) {
        const k = Math.min(1, (t - start) / SCORE_COUNT_MS)
        const eased = 1 - Math.pow(1 - k, 3)
        setShown(Math.round(from + (score - from) * eased))
        if (k < 1) frame = requestAnimationFrame(tick)
      })
    }, reduced ? 0 : delay)
    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(frame)
    }
  }, [score]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={'podium-score' + (shown < 0 ? ' neg' : '')}>
      <span key={delta?.key} className={delta ? (delta.amount > 0 ? 'bump up' : 'bump down') : undefined}>
        {money(shown)}
      </span>
      {delta && (
        <span key={`d${delta.key}`} className={'score-delta ' + (delta.amount > 0 ? 'up' : 'down')} aria-hidden>
          {delta.amount > 0 ? '+' : '−'}
          {money(Math.abs(delta.amount))}
        </span>
      )}
    </div>
  )
}

/** A Bot just Rang In: make it impossible to miss, then show it typing. */
function BotRangIn({ id, name }: { id: ContestantId; name: string }) {
  return (
    <div className={`bot-rang bot-rang-${id}`} role="status">
      <span className="bot-rang-wave" aria-hidden />
      <div className="bot-rang-pill">
        <Avatar id={id} />
        <span>{name} rang in!</span>
      </div>
      <p className="typing">
        typing<span className="dots" />
      </p>
    </div>
  )
}

function Avatar({ id }: { id: ContestantId }) {
  const glyph = id === 'human' ? '★' : id === 'bot1' ? '◆' : '●'
  return <div className={`avatar avatar-${id}`}>{glyph}</div>
}

function BoardView({
  state,
  dispatch,
  rects,
  chosen,
}: {
  state: GameState
  dispatch: Dispatch
  rects: Map<string, DOMRect>
  chosen?: CellRef
}) {
  const humanPicks = state.selector === 'human' && !chosen
  const boardRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    boardRef.current?.querySelectorAll<HTMLElement>('[data-cell]').forEach((el) => {
      rects.set(el.dataset.cell!, el.getBoundingClientRect())
    })
  })
  const picker = contestant(state, state.selector).name
  const chosenCat = chosen ? state.board.categories[chosen.col].name : ''
  const chosenValue = chosen ? state.board.cells[chosen.col][chosen.row].value : 0
  return (
    <div className="board-wrap">
      <p className="hint" aria-live="polite">
        {chosen
          ? `${state.selector === 'human' ? 'You picked' : `${picker} picked`} ${chosenCat} for $${chosenValue}`
          : humanPicks
            ? 'Your pick. Choose a clue.'
            : `${picker} is choosing…`}
      </p>
      <div
        ref={boardRef}
        className={'board' + (chosen ? ' has-chosen' : '')}
        style={{ gridTemplateColumns: `repeat(${state.board.categories.length}, minmax(0, 1fr))` }}
      >
        {state.board.categories.map((c, ci) => (
          <div key={c.id} className={'cat' + (chosen?.col === ci ? ' chosen' : '')}>
            {c.name}
          </div>
        ))}
        {[0, 1, 2, 3, 4].map((row) =>
          state.board.cells.map((col, ci) => {
            const cell = col[row]
            const isChosen = !!chosen && chosen.col === ci && chosen.row === row
            return (
              <button
                key={`${ci}-${row}`}
                data-cell={`${ci}-${row}`}
                className={'tile' + (isChosen ? ' chosen' : cell.played ? ' played' : '')}
                disabled={cell.played || !humanPicks}
                onClick={() => dispatch({ type: 'select', ref: { col: ci, row } })}
              >
                {isChosen || !cell.played ? `$${cell.value}` : ''}
              </button>
            )
          }),
        )}
      </div>
    </div>
  )
}

function Timer({ until, total, now, label }: { until: number; total: number; now: number; label: string }) {
  const left = Math.min(total, Math.max(0, until - now))
  const pct = Math.min(100, (left / total) * 100)
  return (
    <div className={'timer' + (left < 5000 ? ' urgent' : '')}>
      <div className="timer-label">
        <span>{label}</span>
        <span>{Math.ceil(left / 1000)}s</span>
      </div>
      <div className="timer-track">
        <div className="timer-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

const FLIP_MS = 650

const GLIDE_MS = 350

/**
 * When `key` changes, the layout can jump (on phones the Clue screen moves from centred to the top
 * and its card turns compact while the Human types). Animate `el` from where it was to where it is
 * now; the card's own size change is a CSS transition.
 */
function useGlideOnChange(ref: React.RefObject<HTMLElement | null>, key: unknown) {
  const last = useRef<{ key: unknown; top: number } | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const top = el.getBoundingClientRect().top + window.scrollY
    const prev = last.current
    last.current = { key, top }
    if (!prev || prev.key === key) return
    const dy = prev.top - top
    if (Math.abs(dy) < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], {
      duration: GLIDE_MS,
      easing: 'cubic-bezier(.2,.8,.25,1)',
    })
  })
}

/** Animate `el` from the `from` rectangle (a Board tile) to where it actually sits. */
function useFlip(ref: React.RefObject<HTMLElement | null>, from: DOMRect | undefined) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !from || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const to = el.getBoundingClientRect()
    if (!to.width || !to.height) return
    const dx = from.left - to.left
    const dy = from.top - to.top
    el.animate(
      [
        {
          transformOrigin: 'top left',
          transform: `translate(${dx}px, ${dy}px) scale(${from.width / to.width}, ${from.height / to.height})`,
        },
        { transformOrigin: 'top left', transform: 'none' },
      ],
      { duration: FLIP_MS, easing: 'cubic-bezier(.2,.75,.25,1)' },
    )
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}

function ClueView({
  state,
  now,
  dispatch,
  flipFrom,
}: {
  state: GameState
  now: number
  dispatch: Dispatch
  flipFrom?: DOMRect
}) {
  const p = state.phase
  const cell = currentCell(state)!
  const cardRef = useRef<HTMLDivElement>(null)
  useFlip(cardRef, flipFrom)
  const [flying, setFlying] = useState(!!flipFrom)
  useEffect(() => {
    if (!flying) return
    const t = setTimeout(() => setFlying(false), FACE_HOLD_MS + FACE_FADE_MS + 50)
    return () => clearTimeout(t)
  }, [flying])
  // The delayed "rise in" applies only to what is on screen during the entrance. Anything that
  // appears later (e.g. the Ring In timer replacing the reading timer) must show at once.
  const [entering, setEntering] = useState(!!flipFrom)
  useEffect(() => {
    if (!entering) return
    const t = setTimeout(() => setEntering(false), ENTER_DELAY_MS + 400)
    return () => clearTimeout(t)
  }, [entering])
  const clueState = state.clue!
  const verdict = useHumanVerdict(clueState.attempts)
  const botAnswer = useBotAnswer(clueState.attempts)
  const category = state.board.categories[clueState.ref.col].name
  const isDD = cell.dailyDouble
  const humanTried = clueState.attempts.some((a) => a.contestant === 'human')
  const humanTyping = (p.kind === 'answering' && p.contestant === 'human') || (p.kind === 'ddAnswering' && state.selector === 'human')
  const screenRef = useRef<HTMLDivElement>(null)
  useGlideOnChange(screenRef, humanTyping)

  return (
    <div
      ref={screenRef}
      className={'clue-screen' + (entering ? ' entering' : '')}
      style={{ '--enter-delay': `${ENTER_DELAY_MS}ms` } as React.CSSProperties}
    >
      <div className="clue-meta">
        <span className="clue-cat">{category}</span>
        <span className="clue-val">
          {isDD ? `Daily Double${clueState.wager !== undefined ? ` · ${money(clueState.wager)}` : ''}` : `$${cell.value}`}
        </span>
      </div>

      {p.kind === 'ddWager' ? (
        <div ref={cardRef} className="flip-target">
          {flying && <FlipFace category={category} label={`$${cell.value}`} />}
          <DailyDoubleWager state={state} dispatch={dispatch} />
        </div>
      ) : (
        <div
          ref={cardRef}
          className={'clue-card flip-target' + (verdict ? (verdict.correct ? ' verdict-ok' : ' verdict-bad') : '')}
          data-verdict={verdict?.key}
        >
          {flying && <FlipFace category={category} label={isDD ? 'Daily Double' : `$${cell.value}`} />}
          {verdict && <VerdictStamp key={verdict.key} correct={verdict.correct} delta={verdict.delta} />}
          <p className="clue-text">{cell.clue.clue}</p>
          {p.kind === 'reveal' && (
            <p className="answer-reveal">
              <span>Answer:</span> {cell.clue.answer}
            </p>
          )}
        </div>
      )}

      {p.kind === 'reading' && state.mode === 'classic' && <Timer until={p.until} total={TIMING.readMs} now={now} label="Read the clue" />}
      {p.kind === 'ddReading' && <Timer until={p.until} total={TIMING.readMs} now={now} label="Read the clue" />}
      {p.kind === 'ringIn' && <Timer until={p.until} total={clueTiming(state.mode).ringMs} now={now} label="Ring in!" />}
      {(p.kind === 'answering' || p.kind === 'ddAnswering') && (
        <Timer
          until={p.until}
          total={TIMING.answerMs}
          now={now}
          label={`${contestant(state, p.kind === 'answering' ? p.contestant : state.selector).name} answering`}
        />
      )}

      <Attempts state={state} attempts={clueState.attempts} hideIndex={botAnswer?.index} />

      {botAnswer && (
        <BotAnswerReveal
          key={botAnswer.index}
          attempt={botAnswer.attempt}
          name={contestant(state, botAnswer.attempt.contestant).name}
        />
      )}

      {(p.kind === 'reading' || p.kind === 'ringIn') && !isDD && (
        <button className="ring" disabled={p.kind === 'reading' || humanTried} onClick={() => dispatch({ type: 'ringIn' })}>
          {humanTried ? 'Already answered' : p.kind === 'reading' ? 'Get ready…' : 'Ring in'}
          <small>Space</small>
        </button>
      )}

      {((p.kind === 'answering' && p.contestant === 'human') || (p.kind === 'ddAnswering' && state.selector === 'human')) && (
        <AnswerBox onSubmit={(text) => dispatch({ type: 'submitAnswer', text })} />
      )}

      {p.kind === 'answering' && p.contestant !== 'human' && (
        <BotRangIn key={`${p.contestant}-${clueState.attempts.length}`} id={p.contestant} name={contestant(state, p.contestant).name} />
      )}
      {p.kind === 'ddAnswering' && state.selector !== 'human' && (
        <p className="typing">
          {contestant(state, state.selector).name} is typing<span className="dots" />
        </p>
      )}

      {p.kind === 'reveal' && (
        <RevealActions
          state={state}
          clue={cell.clue}
          dispatch={dispatch}
          summary={
            clueState.correctBy
              ? `${contestant(state, clueState.correctBy).name} got it!`
              : clueState.attempts.length
                ? 'Nobody got it.'
                : "Time's up. Nobody rang in."
          }
        />
      )}
    </div>
  )
}

/** The tile's face, shown on the flying card and faded out as it lands. */
const VERDICT_MS = 1_600

/** The Human's newest judged Attempt on this Clue, for VERDICT_MS after it lands. */
function useHumanVerdict(attempts: Attempt[]) {
  const humanCount = attempts.filter((a) => a.contestant === 'human').length
  const seen = useRef(humanCount)
  const [verdict, setVerdict] = useState<{ correct: boolean; delta: number; key: number } | null>(null)
  useEffect(() => {
    if (humanCount <= seen.current) return
    seen.current = humanCount
    const a = [...attempts].reverse().find((x) => x.contestant === 'human')!
    setVerdict((v) => ({ correct: a.correct, delta: a.delta, key: (v?.key ?? 0) + 1 }))
    const t = setTimeout(() => setVerdict(null), VERDICT_MS)
    return () => clearTimeout(t)
  }, [humanCount]) // eslint-disable-line react-hooks/exhaustive-deps
  return verdict
}

const BOT_ANSWER_MS = 2_400
const BOT_TYPE_MS = 700

/** A Bot's newest Attempt on this Clue, for BOT_ANSWER_MS after it lands. */
function useBotAnswer(attempts: Attempt[]) {
  const count = attempts.length
  const seen = useRef(count)
  const [shown, setShown] = useState<{ attempt: Attempt; index: number } | null>(null)
  useEffect(() => {
    if (count <= seen.current) return
    seen.current = count
    const index = count - 1
    const attempt = attempts[index]
    if (attempt.contestant === 'human') return
    setShown({ attempt, index })
    const t = setTimeout(() => setShown(null), BOT_ANSWER_MS)
    return () => clearTimeout(t)
  }, [count]) // eslint-disable-line react-hooks/exhaustive-deps
  return shown
}

/** The Bot's Answer types out in its colour, then a verdict badge stamps in. */
function BotAnswerReveal({ attempt, name }: { attempt: Attempt; name: string }) {
  const text = attempt.display || '(no answer)'
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const [typed, setTyped] = useState(reduced ? text.length : 0)
  useEffect(() => {
    if (typed >= text.length) return
    const step = Math.max(25, Math.min(80, BOT_TYPE_MS / text.length))
    const t = setTimeout(() => setTyped((n) => n + 1), step)
    return () => clearTimeout(t)
  }, [typed, text.length])
  const done = typed >= text.length
  const masked = !attempt.correct && !!attempt.display
  return (
    <div className={`bot-answer bot-answer-${attempt.contestant}` + (done ? (attempt.correct ? ' ok' : ' bad') : '')} role="status">
      <div className="bot-answer-head">
        <Avatar id={attempt.contestant} />
        <span>{name} answers</span>
      </div>
      <div className={'bot-answer-text' + (masked ? ' masked' : '')}>
        {text.slice(0, typed)}
        {!done && <span className="caret" aria-hidden />}
      </div>
      {done && (
        <div className="bot-answer-badge">
          <span className="mark" aria-hidden>
            {attempt.correct ? '✓' : '✗'}
          </span>
          {attempt.correct ? 'Correct' : 'Wrong'} {attempt.delta > 0 ? '+' : '−'}
          {money(Math.abs(attempt.delta))}
        </div>
      )}
    </div>
  )
}

const SPARKS = 14

function VerdictStamp({ correct, delta }: { correct: boolean; delta: number }) {
  return (
    <div className={'verdict ' + (correct ? 'ok' : 'bad')} aria-live="assertive">
      {correct &&
        Array.from({ length: SPARKS }, (_, i) => (
          <span
            key={i}
            className="spark"
            style={{ '--a': `${(360 / SPARKS) * i}deg`, '--d': `${i % 2 ? 90 : 130}px` } as React.CSSProperties}
          />
        ))}
      <div className="verdict-stamp">
        <span className="verdict-word">{correct ? 'Correct!' : 'Not quite'}</span>
        {delta !== 0 && (
          <span className="verdict-delta">
            {delta > 0 ? '+' : '−'}
            {money(Math.abs(delta))}
          </span>
        )}
      </div>
    </div>
  )
}

function FlipFace({ category, label }: { category: string; label: string }) {
  return (
    <div className="flip-face" aria-hidden style={{ animationDelay: `${FACE_HOLD_MS}ms`, animationDuration: `${FACE_FADE_MS}ms` }}>
      <span className="flip-cat">{category}</span>
      <span className="flip-val">{label}</span>
    </div>
  )
}

function Attempts({ state, attempts, hideIndex }: { state: GameState; attempts: Attempt[]; hideIndex?: number }) {
  const visible = attempts.map((a, i) => ({ a, i })).filter(({ i }) => i !== hideIndex)
  if (!visible.length) return null
  return (
    <ul className="attempts">
      {visible.map(({ a, i }) => (
        <li key={i} className={a.correct ? 'ok' : 'bad'}>
          <Avatar id={a.contestant} />
          <span className="who">{contestant(state, a.contestant).name}</span>
          <span className={'what' + (a.contestant !== 'human' && !a.correct ? ' masked' : '')}>{a.display || '(no answer)'}</span>
          <span className="delta">
            {a.overridden ? 'overridden ' : ''}
            {a.delta > 0 ? '+' : ''}
            {money(a.delta)}
          </span>
        </li>
      ))}
    </ul>
  )
}

function AnswerBox({ onSubmit, placeholder = 'Type your answer and press Enter' }: { onSubmit: (t: string) => void; placeholder?: string }) {
  const [text, setText] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useKeyboardInput(ref, { revealFrom: '.clue-screen, .final' })
  return (
    <form
      className="answer-box"
      onSubmit={(e) => {
        e.preventDefault()
        dismissKeyboard()
        onSubmit(text)
      }}
    >
      <input
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
      <button className="primary" type="submit">
        Submit
      </button>
    </form>
  )
}

function WagerBox({ min, max, onSubmit, label }: { min: number; max: number; onSubmit: (n: number) => void; label: string }) {
  const [value, setValue] = useState(String(Math.min(max, Math.max(min, Math.round(max / 2 / 100) * 100))))
  const ref = useRef<HTMLInputElement>(null)
  useKeyboardInput(ref, { select: true })
  const n = Number(value)
  const valid = value.trim() !== '' && Number.isInteger(n) && n >= min && n <= max
  return (
    <form
      className="wager-box"
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        dismissKeyboard()
        onSubmit(n)
      }}
    >
      <label>
        {label} <small>({money(min)}–{money(max)})</small>
      </label>
      <div className="row">
        <input ref={ref} type="number" inputMode="numeric" min={min} max={max} step={1} value={value} onChange={(e) => setValue(e.target.value)} />
        <button className="primary" type="submit" disabled={!valid}>
          Lock it in
        </button>
      </div>
      <div className="quick">
        <button type="button" className="ghost" onClick={() => setValue(String(min))}>
          Min
        </button>
        <button type="button" className="ghost" onClick={() => setValue(String(Math.round(max / 2)))}>
          Half
        </button>
        <button type="button" className="ghost" onClick={() => setValue(String(max))}>
          All in
        </button>
      </div>
    </form>
  )
}

function DailyDoubleWager({ state, dispatch }: { state: GameState; dispatch: Dispatch }) {
  const human = state.selector === 'human'
  return (
    <div className="dd-splash">
      <h2>Daily Double!</h2>
      {human ? (
        <WagerBox min={5} max={dailyDoubleMax(state)} label="Your wager" onSubmit={(amount) => dispatch({ type: 'ddWager', amount })} />
      ) : (
        <p className="typing">
          {contestant(state, state.selector).name} is making a wager<span className="dots" />
        </p>
      )}
    </div>
  )
}

function RevealActions({
  state,
  clue,
  dispatch,
  summary,
}: {
  state: GameState
  clue: Clue
  dispatch: Dispatch
  summary: string
}) {
  const [flagging, setFlagging] = useState(false)
  const [flagged, setFlagged] = useState(false)
  const overridable = overridableAttempt(state)
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => ref.current?.focus(), [])

  return (
    <div className="reveal-actions">
      <p className="summary">{summary}</p>
      <div className="row">
        {overridable && (
          <button
            className="ghost override"
            onClick={() => {
              logOverride(state.level, clue, overridable.typed, overridable.matchScore)
              dispatch({ type: 'override' })
            }}
          >
            I was right
          </button>
        )}
        <button className="ghost" disabled={flagged} onClick={() => setFlagging(true)}>
          {flagged ? 'Flagged ✓' : 'Flag clue'}
        </button>
        <button ref={ref} className="primary" onClick={() => dispatch({ type: 'continue' })}>
          Continue
        </button>
      </div>
      {flagging && (
        <FlagDialog
          onCancel={() => setFlagging(false)}
          onSubmit={(reason, note) => {
            logFlag(state.level, clue, reason, note)
            setFlagging(false)
            setFlagged(true)
          }}
        />
      )}
    </div>
  )
}

function FlagDialog({ onSubmit, onCancel }: { onSubmit: (r: FlagReason, note: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState<FlagReason>('wrong answer')
  const [note, setNote] = useState('')
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Flag this clue</h3>
        <div className="reasons">
          {FLAG_REASONS.map((r) => (
            <button key={r} className={r === reason ? 'on' : ''} onClick={() => setReason(r)}>
              {r}
            </button>
          ))}
        </div>
        <textarea placeholder="Optional note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
        <div className="row end">
          <button className="ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="primary" onClick={() => onSubmit(reason, note)}>
            Flag
          </button>
        </div>
      </div>
    </div>
  )
}

function Interstitial({ title, lines, action, onAction }: { title: string; lines: string[]; action: string; onAction: () => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => ref.current?.focus(), [])
  return (
    <div className="interstitial">
      <h2>{title}</h2>
      {lines.map((l) => (
        <p key={l}>{l}</p>
      ))}
      <button ref={ref} className="primary big" onClick={onAction}>
        {action}
      </button>
    </div>
  )
}

// ---------------- Final Round ----------------

function FinalView({ state, now, dispatch }: { state: GameState; now: number; dispatch: Dispatch }) {
  const p = state.phase
  const f = state.final
  const humanIn = f.eligible.includes('human')
  const clue = finalClue(state)
  const category = f.options.find((o) => o.id === f.categoryId)?.name
  const finalRef = useRef<HTMLDivElement>(null)
  useGlideOnChange(finalRef, p.kind === 'finalAnswering' && humanIn && !f.answers.human)

  if (p.kind === 'finalChoose') {
    const chooser = contestant(state, f.chooser!)
    return (
      <div className="final">
        <p className="eyebrow">Final Round</p>
        <h2>{f.chooser === 'human' ? 'You pick the category' : `${chooser.name} is choosing the category…`}</h2>
        {!humanIn && <p className="hint">You need more than $0 to play the Final. You'll watch this one.</p>}
        <div className="final-options">
          {f.options.map((o) => (
            <button
              key={o.id}
              className="final-option"
              disabled={f.chooser !== 'human'}
              onClick={() => dispatch({ type: 'finalChoose', categoryId: o.id })}
            >
              {o.name}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div ref={finalRef} className="final">
      <p className="eyebrow">Final Round</p>
      <div className="clue-meta">
        <span className="clue-cat">{category}</span>
      </div>

      {p.kind === 'finalWager' && (
        <WagerBox
          min={0}
          max={contestant(state, 'human').score}
          label="Your wager"
          onSubmit={(amount) => dispatch({ type: 'finalWager', amount })}
        />
      )}

      {(p.kind === 'finalReading' || p.kind === 'finalAnswering' || p.kind === 'finalReveal') && clue && (
        <div className="clue-card">
          <p className="clue-text">{clue.clue}</p>
          {p.kind === 'finalReveal' && (
            <p className="answer-reveal">
              <span>Answer:</span> {clue.answer}
            </p>
          )}
        </div>
      )}

      {p.kind === 'finalReading' && <Timer until={p.until} total={TIMING.readMs} now={now} label="Read the clue" />}
      {p.kind === 'finalAnswering' && (
        <>
          <Timer until={p.until} total={TIMING.finalAnswerMs} now={now} label="Everyone answering" />
          <div className="final-status">
            {f.eligible.map((id) => (
              <span key={id} className={f.answers[id] ? 'done' : ''}>
                <Avatar id={id} /> {contestant(state, id).name} {f.answers[id] ? '✓' : '…'}
              </span>
            ))}
          </div>
          {humanIn && !f.answers.human && <AnswerBox onSubmit={(text) => dispatch({ type: 'submitAnswer', text })} />}
        </>
      )}

      {p.kind === 'finalReveal' && <FinalReveal state={state} dispatch={dispatch} />}
    </div>
  )
}

/** Final Round Answers are revealed one by one, lowest pre-Final score first. */
function finalRevealOrder(state: GameState): ContestantId[] {
  const f = state.final
  return [...f.eligible].sort(
    (a, b) => contestant(state, a).score - f.answers[a]!.delta - (contestant(state, b).score - f.answers[b]!.delta),
  )
}

function FinalReveal({ state, dispatch }: { state: GameState; dispatch: Dispatch }) {
  const f = state.final
  const order = finalRevealOrder(state)
  const [shown, setShown] = useState(1)
  useEffect(() => {
    if (shown >= order.length) return
    const t = setTimeout(() => setShown((n) => n + 1), FINAL_STEP_MS)
    return () => clearTimeout(t)
  }, [shown, order.length])

  return (
    <>
      <ul className="attempts">
        {order.slice(0, shown).map((id) => {
          const a = f.answers[id]!
          return (
            <li key={id} className={(a.correct ? 'ok' : 'bad') + ' pop'}>
              <Avatar id={id} />
              <span className="who">{contestant(state, id).name}</span>
              <span className={'what' + (id !== 'human' && !a.correct ? ' masked' : '')}>{a.display || '(no answer)'}</span>
              <span className="delta">
                wagered {money(f.wagers[id] ?? 0)} → {a.delta >= 0 ? '+' : ''}
                {money(a.delta)}
              </span>
            </li>
          )
        })}
      </ul>
      {shown >= order.length && (
        <RevealActions state={state} clue={finalClue(state)!} dispatch={dispatch} summary="Final scores are in." />
      )}
    </>
  )
}

/** This game's Earnings and the lifetime total (the game was recorded as it ended). */
function GameOverEarnings({ earned }: { earned: number }) {
  const [lifetime] = useState(() => summarize(loadHistory()).earnings)
  return (
    <div className="gameover-earnings">
      <div>
        <span className="stats-label">This game</span>
        <span className={'stats-big' + (earned < 0 ? ' neg' : '')}>{money(earned)}</span>
      </div>
      <div>
        <span className="stats-label">Lifetime</span>
        <span className={'stats-big' + (lifetime < 0 ? ' neg' : '')}>{money(lifetime)}</span>
      </div>
    </div>
  )
}

function GameOver({ state }: { state: GameState }) {
  const winners = state.winners ?? []
  const names = winners.map((id) => contestant(state, id).name)
  const humanWon = winners.includes('human')
  return (
    <div className="interstitial gameover">
      <p className="eyebrow">Game over</p>
      <h2>
        {humanWon
          ? winners.length > 1
            ? `It's a tie! You share the win with ${names.filter((n) => n !== contestant(state, 'human').name).join(' & ')}.`
            : 'You win! 🎉'
          : `${names.join(' & ')} win${names.length > 1 ? '' : 's'}.`}
      </h2>
      {state.round === 'final' && !state.final.categoryId && <p>Nobody had more than $0, so there was no Final Round.</p>}
      <GameOverEarnings earned={contestant(state, 'human').score} />
      <p className="hint">Press New game to play again. Your stats are on the start screen.</p>
    </div>
  )
}
