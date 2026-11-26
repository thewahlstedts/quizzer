import { describe, expect, it } from 'vitest'
import type { GameRecord } from './history'
import { resultText, statsText } from './share'

const base: GameRecord = {
  v: 1, id: 'x', endedAt: 0, level: 2, botDifficulty: 'hard', mode: 'fast',
  contestants: [
    { id: 'human', name: 'Sam', score: 12400 },
    { id: 'bot1', name: 'Opal', score: 8000 },
    { id: 'bot2', name: 'Nora', score: 3200 },
  ],
  earnings: 12400, place: 1, won: true, correct: 9, wrong: 3,
}

describe('resultText', () => {
  it('describes a win', () => {
    expect(resultText(base)).toBe(
      'Quizzer: 🏆 I won with $12,400!\nLevel 2 · Hard Bots · Fast\nvs Opal $8,000 · Nora $3,200\n9/12 correct',
    )
  })
  it('describes a loss with the place, and a negative score', () => {
    const r = { ...base, contestants: [{ ...base.contestants[0], score: -400 }, ...base.contestants.slice(1)], earnings: -400, place: 3, won: false }
    expect(resultText(r).split('\n')[0]).toBe('Quizzer: I finished 3rd with -$400.')
  })
  it('describes a tie and leaves out the accuracy line with no Answers', () => {
    const r = { ...base, contestants: [base.contestants[0], { ...base.contestants[1], score: 12400 }, base.contestants[2]], correct: 0, wrong: 0 }
    const text = resultText(r)
    expect(text.split('\n')[0]).toBe('Quizzer: 🤝 I tied for the win with $12,400!')
    expect(text).not.toContain('correct')
  })
})

describe('statsText', () => {
  it('summarizes a period', () => {
    expect(statsText({ games: 3, wins: 1, earnings: 4600, correct: 17, wrong: 11, best: 4000 }, 'This week')).toBe(
      'My Quizzer stats (this week):\n💰 $4,600 earned\n🎮 3 games · 🏆 1 win\n✅ 61% correct\n⭐ Best game $4,000',
    )
  })
  it('handles a single game and no Answers', () => {
    expect(statsText({ games: 1, wins: 0, earnings: 0, correct: 0, wrong: 0, best: 0 }, 'Today')).toBe(
      'My Quizzer stats (today):\n💰 $0 earned\n🎮 1 game · 🏆 0 wins\n⭐ Best game $0',
    )
  })
})
