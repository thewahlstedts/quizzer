import { useLayoutEffect, type RefObject } from 'react'

/**
 * Focus a text input on mount (opening the on-screen keyboard), and when it goes away put the
 * page back where it was. iOS Safari scrolls the page up to make room for the keyboard; if the
 * focused input is then removed from the DOM (we unmount it on submit or time-out), the keyboard
 * closes but the page is left scrolled. Blurring first lets iOS close the keyboard normally, and
 * restoring the saved position covers what it doesn't undo.
 */
export function useKeyboardInput(ref: RefObject<HTMLInputElement | null>, select = false) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const x = window.scrollX
    const y = window.scrollY
    if (select) el.select()
    else el.focus()
    // Layout-effect cleanup runs before React removes the input, so the blur happens while it is
    // still in the DOM.
    return () => {
      if (document.activeElement === el) el.blur()
      restoreScroll(x, y)
    }
  }, [ref, select])
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
