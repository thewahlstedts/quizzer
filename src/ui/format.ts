import type { GameMode } from '../engine/types'

export const MODE_LABEL: Record<GameMode, string> = { slow: 'Slow', medium: 'Medium', fast: 'Fast' }

export const money = (n: number) => (n < 0 ? `-$${Math.abs(n).toLocaleString()}` : `$${n.toLocaleString()}`)
