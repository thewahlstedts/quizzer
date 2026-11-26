import type { Category, ClueBank, Level } from '../engine/types'

/**
 * Every `level-<N>.json` and `level-<N>-<part>.json` file is merged into that
 * Level's bank, so new batches of Categories can be added as separate files.
 */
const files = import.meta.glob<ClueBank>('./level-*.json', { eager: true, import: 'default' })

function bankFor(level: Level): ClueBank {
  const categories: Category[] = Object.entries(files)
    .filter(([path]) => new RegExp(`^\\./level-${level}(-[a-z0-9]+)?\\.json$`).test(path))
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([, bank]) => bank.categories)
  return { level, categories }
}

export const BANKS: Record<Level, ClueBank> = {
  1: bankFor(1),
  2: bankFor(2),
  3: bankFor(3),
  4: bankFor(4),
}
