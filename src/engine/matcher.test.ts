import { describe, expect, it } from 'vitest'
import { judge, normalize } from './matcher'

const clue = { answer: 'Abraham Lincoln', alternates: ['Lincoln', 'Abe Lincoln'] }

describe('normalize', () => {
  it('strips case, punctuation, accents, and leading articles/question phrasing', () => {
    expect(normalize('  The   Eiffel-Tower! ')).toBe('eiffel tower')
    expect(normalize('What is a Pokémon?')).toBe('pokemon')
    expect(normalize('Who is the Beatles')).toBe('beatles')
  })
})

describe('judge', () => {
  it('accepts canonical answer and alternates', () => {
    expect(judge('abraham lincoln', clue).correct).toBe(true)
    expect(judge('Abe Lincoln', clue).correct).toBe(true)
    expect(judge('lincoln', clue).correct).toBe(true)
  })
  it('tolerates small typos in proportion to length', () => {
    expect(judge('Abraham Lincon', clue).correct).toBe(true)
    expect(judge('Linclon', clue).correct).toBe(false) // 2 edits on an 7-char answer
  })
  it('is strict on short answers', () => {
    expect(judge('cat', { answer: 'Cow', alternates: [] }).correct).toBe(false)
    expect(judge('cow', { answer: 'Cow', alternates: [] }).correct).toBe(true)
  })
  it('rejects empty answers with score 0', () => {
    expect(judge('  ', clue)).toEqual({ correct: false, matchScore: 0 })
  })
  it('reports a match score for wrong answers', () => {
    const j = judge('Abraham Lincoln Jr Senior', clue)
    expect(j.correct).toBe(false)
    expect(j.matchScore).toBeGreaterThan(0.5)
  })
})
