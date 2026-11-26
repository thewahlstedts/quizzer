import { useState } from 'react'
import { MODE_LABEL, money } from './format'
import { clearHistory, loadHistory, PERIODS, periodStart, summarize, type GameRecord, type Period } from './history'
import { statsText } from './share'
import { ShareButton } from './ShareButton'

const PLACE = ['1st', '2nd', '3rd']
const SHOW = 8

/** Earnings and results for Today / This week / This month / All time, plus the game history. */
export function StatsCard() {
  const [history, setHistory] = useState<GameRecord[]>(loadHistory)
  const [period, setPeriod] = useState<Period>(() => {
    try {
      const p = localStorage.getItem('quizzer.statsPeriod') as Period | null
      return p && PERIODS.some((x) => x.id === p) ? p : 'all'
    } catch {
      return 'all'
    }
  })
  const [showAll, setShowAll] = useState(false)
  const from = periodStart(period, new Date())
  const s = summarize(history, from)
  const answered = s.correct + s.wrong
  const inPeriod = history.filter((r) => r.endedAt >= from)
  const shown = showAll ? inPeriod : inPeriod.slice(0, SHOW)

  const choose = (p: Period) => {
    setPeriod(p)
    setShowAll(false)
    try {
      localStorage.setItem('quizzer.statsPeriod', p)
    } catch {
      /* ignore */
    }
  }

  return (
    <section className="stats-card">
      <div className="stats-head">
        <h3>Your stats</h3>
        {s.games > 0 && <ShareButton getText={() => statsText(s, PERIODS.find((x) => x.id === period)!.label)} />}
      </div>
      <div className="segmented stats-periods" role="tablist">
        {PERIODS.map((p) => (
          <button key={p.id} role="tab" aria-selected={p.id === period} className={p.id === period ? 'on' : ''} onClick={() => choose(p.id)}>
            {p.label}
          </button>
        ))}
      </div>

      <div className={'stats-earnings' + (s.earnings < 0 ? ' neg' : '')}>
        <span className="stats-label">Earnings</span>
        <span className="stats-big">{money(s.earnings)}</span>
      </div>
      <dl className="stats-grid">
        <div>
          <dt>Games</dt>
          <dd>{s.games}</dd>
        </div>
        <div>
          <dt>Wins</dt>
          <dd>
            {s.wins}
            {s.games > 0 && <small> ({Math.round((100 * s.wins) / s.games)}%)</small>}
          </dd>
        </div>
        <div>
          <dt>Correct</dt>
          <dd>{answered ? `${Math.round((100 * s.correct) / answered)}%` : '–'}</dd>
        </div>
        <div>
          <dt>Best game</dt>
          <dd>{s.best === null ? '–' : money(s.best)}</dd>
        </div>
      </dl>

      {inPeriod.length === 0 ? (
        <p className="stats-empty">{history.length ? 'No finished games in this period.' : 'Finish a game to start your history.'}</p>
      ) : (
        <>
          <ul className="history">
            {shown.map((r) => (
              <HistoryRow key={r.id} r={r} />
            ))}
          </ul>
          <div className="row">
            {inPeriod.length > SHOW && (
              <button className="ghost" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show fewer' : `Show all ${inPeriod.length}`}
              </button>
            )}
            <button
              className="ghost danger"
              onClick={() => {
                if (!window.confirm('Delete your whole game history and stats? This cannot be undone.')) return
                clearHistory()
                setHistory([])
              }}
            >
              Clear history
            </button>
          </div>
        </>
      )}
    </section>
  )
}

function HistoryRow({ r }: { r: GameRecord }) {
  const others = r.contestants.filter((c) => c.id !== 'human')
  const when = new Date(r.endedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  return (
    <li className={r.won ? 'won' : ''}>
      <div className="history-top">
        <span className="history-place">{r.won ? (r.place === 1 && others.some((o) => o.score === r.earnings) ? 'Tied 1st' : 'Won') : PLACE[r.place - 1] ?? `${r.place}th`}</span>
        <span className={'history-earn' + (r.earnings < 0 ? ' neg' : '')}>{money(r.earnings)}</span>
      </div>
      <div className="history-meta">
        {when} · Level {r.level} · {r.botDifficulty[0].toUpperCase() + r.botDifficulty.slice(1)}
        {' · '}
        {MODE_LABEL[r.mode]} · {r.correct}/{r.correct + r.wrong} correct
      </div>
      <div className="history-meta">vs {others.map((o) => `${o.name} ${money(o.score)}`).join(', ')}</div>
    </li>
  )
}
