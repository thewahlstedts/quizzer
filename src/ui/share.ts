import { MODE_LABEL, money } from './format'
import type { GameRecord, Summary } from './history'

export const SHARE_TITLE = 'Quizzer'

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

/** The text shared for one finished game. */
export function resultText(r: GameRecord): string {
  const others = r.contestants.filter((c) => c.id !== 'human')
  const tied = r.won && others.some((o) => o.score === r.earnings)
  const headline = r.won ? (tied ? `🤝 I tied for the win with ${money(r.earnings)}!` : `🏆 I won with ${money(r.earnings)}!`) : `I finished ${ordinal(r.place)} with ${money(r.earnings)}.`
  const answered = r.correct + r.wrong
  return [
    `Quizzer: ${headline}`,
    `Level ${r.level} · ${cap(r.botDifficulty)} Bots · ${MODE_LABEL[r.mode]}`,
    `vs ${others.map((o) => `${o.name} ${money(o.score)}`).join(' · ')}`,
    answered ? `${r.correct}/${answered} correct` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/** The text shared for a stats period. */
export function statsText(s: Summary, periodLabel: string): string {
  const answered = s.correct + s.wrong
  return [
    `My Quizzer stats (${periodLabel.toLowerCase()}):`,
    `💰 ${money(s.earnings)} earned`,
    `🎮 ${s.games} game${s.games === 1 ? '' : 's'} · 🏆 ${s.wins} win${s.wins === 1 ? '' : 's'}`,
    answered ? `✅ ${Math.round((100 * s.correct) / answered)}% correct` : '',
    s.best !== null ? `⭐ Best game ${money(s.best)}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function ordinal(n: number): string {
  return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed'

/**
 * Share `text` plus a link to the game: the system share sheet where there is one (phones), or the
 * clipboard otherwise.
 */
export async function share(text: string): Promise<ShareOutcome> {
  const url = location.origin + '/'
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: SHARE_TITLE, text, url })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
      // fall through to the clipboard (e.g. share not allowed here)
    }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`)
    return 'copied'
  } catch {
    return 'failed'
  }
}
