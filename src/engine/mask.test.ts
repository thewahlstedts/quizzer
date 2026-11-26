import { expect, it } from 'vitest'
import { maskAnswer } from './mask'
import { seeded } from './rng'

it('has one asterisk per non-space character, spaces never doubled or at the ends', () => {
  const rng = seeded(7)
  for (const answer of ['Mount Everest', 'cat', 'Pacific Ocean', 'a', 'George Washington Carver']) {
    for (let i = 0; i < 50; i++) {
      const m = maskAnswer(answer, rng)
      expect(m.replace(/ /g, '')).toBe('*'.repeat(answer.replace(/\s/g, '').length))
      expect(m).not.toMatch(/^ | $|  /)
    }
  }
})
