import type { ClueBank, Level } from '../engine/types'
import level1 from './level-1.json'
import level2 from './level-2.json'
import level3 from './level-3.json'
import level4 from './level-4.json'

export const BANKS: Record<Level, ClueBank> = {
  1: level1 as ClueBank,
  2: level2 as ClueBank,
  3: level3 as ClueBank,
  4: level4 as ClueBank,
}
