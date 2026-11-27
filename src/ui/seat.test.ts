import { describe, expect, it } from 'vitest'
import { newGame } from '../engine/game'
import { seeded } from '../engine/rng'
import { BANKS } from '../content'
import { avatarStyle, isBot } from './seat'

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
