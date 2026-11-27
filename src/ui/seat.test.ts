import { describe, expect, it } from 'vitest'
import { newGame } from '../engine/game'
import { seeded } from '../engine/rng'
import { BANKS } from '../content'
import { avatarStyle, isBot, namesList, voteAttempt, waitingOn } from './seat'

describe('avatarStyle', () => {
  it('matches the single-player look: you are the star, then Bot 1 and Bot 2', () => {
    const s = newGame(BANKS[1], 'normal', seeded(1))
    expect(avatarStyle(s, 'human', 'human')).toEqual({ glyph: '★', className: 'avatar-human' })
    expect(avatarStyle(s, 'human', 'bot1')).toEqual({ glyph: '◆', className: 'avatar-bot1' })
    expect(avatarStyle(s, 'human', 'bot2')).toEqual({ glyph: '●', className: 'avatar-bot2' })
  })

  it('gives each player the star on their own screen', () => {
    const s = newGame(BANKS[1], 'normal', seeded(1), [
      { id: 'p1', name: 'Ann' },
      { id: 'p2', name: 'Ben' },
    ])
    expect(avatarStyle(s, 'p2', 'p2').glyph).toBe('★')
    expect(avatarStyle(s, 'p2', 'p1').glyph).toBe('◆')
    expect(avatarStyle(s, 'p2', 'bot1').glyph).toBe('●')
    expect(isBot(s, 'bot1')).toBe(true)
    expect(isBot(s, 'p1')).toBe(false)
  })
})

describe('online helpers', () => {
  const seats = [
    { id: 'p1', name: 'Ann' },
    { id: 'p2', name: 'Ben' },
    { id: 'p3', name: 'Cat' },
  ]

  it('lists the other Humans still to press Continue', () => {
    const s = newGame(BANKS[1], 'normal', seeded(1), seats)
    expect(waitingOn(s, 'p1')).toEqual(['Ben', 'Cat'])
    s.ready = ['p2']
    expect(waitingOn(s, 'p1')).toEqual(['Cat'])
    expect(namesList(waitingOn(s, 'p2'))).toBe('Ann and Cat')
    expect(namesList(['Ann', 'Ben', 'Cat'])).toBe('Ann, Ben and Cat')
    expect(namesList([])).toBe('')
  })

  it('finds the Answer an Override vote is about', () => {
    const s = newGame(BANKS[1], 'normal', seeded(1), seats)
    expect(voteAttempt(s)).toBeUndefined()
    const a = { contestant: 'p2', typed: 'paris', display: 'paris', correct: false, matchScore: 0.5, delta: -200 }
    s.clue = { ref: { col: 0, row: 0 }, attempts: [a], botKnows: {}, botRingAt: {} }
    s.phase = { kind: 'reveal' }
    s.vote = { by: 'p2', agree: [], until: 1 }
    expect(voteAttempt(s)).toEqual(a)
  })
})
