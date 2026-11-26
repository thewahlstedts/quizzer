import { useLayoutEffect, type RefObject } from 'react'

/**
 * Focus a text input on mount (opening the on-screen keyboard), and when it goes away put the
 * page back where it was. iOS Safari scrolls the page up to make room for the keyboard; if the
 * focused input is then removed from the DOM (we unmount it on submit or time-out), the keyboard
 * closes but the page is left scrolled. Blurring first lets iOS close the keyboard normally, and
 * restoring the saved position covers what it doesn't undo.
 */
export function useKeyboardInput(
  ref: RefObject<HTMLInputElement | null>,
  { select = false, revealFrom }: { select?: boolean; revealFrom?: string } = {},
) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const x = window.scrollX
    const y = window.scrollY
    if (select) el.select()
    else el.focus()
    const stopReveal = revealFrom ? keepRevealed(el, revealFrom) : undefined
    // Layout-effect cleanup runs before React removes the input, so the blur happens while it is
    // still in the DOM.
    return () => {
      stopReveal?.()
      if (document.activeElement === el) el.blur()
      restoreScroll(x, y)
    }
  }, [ref, select, revealFrom])
}

/**
 * While the on-screen keyboard is open, scroll so that everything from the nearest `selector`
 * ancestor (e.g. the Clue screen, starting with its Category line) down to the input's form is
 * visible above the keyboard. iOS on its own only guarantees the input itself is visible, and
 * scrolls the Clue off the top to get it. If the block is too tall to fit, keep the input's form
 * just above the keyboard instead.
 */
function keepRevealed(input: HTMLInputElement, selector: string): () => void {
  const vv = window.visualViewport
  const top = input.closest(selector)
  const bottom = input.form ?? input
  if (!vv || !top) return () => {}
  const fit = () => {
    // Only when a keyboard is actually covering part of the page (not on desktop).
    if (document.activeElement !== input || vv.height > window.innerHeight * 0.85) return
    const margin = 8
    const t = top.getBoundingClientRect().top - vv.offsetTop
    const b = bottom.getBoundingClientRect().bottom - vv.offsetTop
    const below = b + margin - vv.height // > 0: the form is hidden behind the keyboard
    const above = t - margin // < 0: the Clue's top is scrolled off the screen
    let shift = 0
    if (b - t + 2 * margin > vv.height) shift = below // too tall: the input wins
    else if (above < 0) shift = above
    else if (below > 0) shift = below
    if (Math.abs(shift) > 1) {
      const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      window.scrollBy({ top: shift, behavior: smooth ? 'smooth' : 'auto' })
    }
  }
  vv.addEventListener('resize', fit)
  // iOS scrolls the input into view itself as the keyboard animates in; correct after it settles.
  const timer = window.setTimeout(fit, 400)
  return () => {
    vv.removeEventListener('resize', fit)
    window.clearTimeout(timer)
  }
}

/** Call before an action that will unmount the focused input. */
export function dismissKeyboard() {
  const el = document.activeElement
  if (el instanceof HTMLElement) el.blur()
}

function restoreScroll(x: number, y: number) {
  window.scrollTo(x, y)
  // The keyboard animates away over ~250ms; iOS may adjust the scroll during that, so restore again after.
  window.setTimeout(() => window.scrollTo(x, y), 350)
}
