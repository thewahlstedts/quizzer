import { useEffect, useState } from 'react'
import { share, type ShareOutcome } from './share'

const LABEL: Partial<Record<ShareOutcome, string>> = { shared: 'Shared!', copied: 'Copied!', failed: "Couldn't share" }

/** Shares the text from `getText()` and briefly shows how it went. */
export function ShareButton({ getText, label = 'Share', className = 'ghost' }: { getText: () => string; label?: string; className?: string }) {
  const [outcome, setOutcome] = useState<ShareOutcome | null>(null)
  useEffect(() => {
    if (!outcome) return
    const t = setTimeout(() => setOutcome(null), 2000)
    return () => clearTimeout(t)
  }, [outcome])
  return (
    <button className={className} onClick={async () => setOutcome(await share(getText()))}>
      {(outcome && LABEL[outcome]) || label}
    </button>
  )
}
