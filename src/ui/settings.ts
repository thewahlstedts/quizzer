/** Per-browser display preferences (not game rules). */

const AUTO_KEY = 'quizzer.autoContinue'

/** With Auto continue on, a Clue's reveal moves on by itself after this long. */
export const AUTO_CONTINUE_MS = 2_500

export function loadAutoContinue(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) === '1'
  } catch {
    return false
  }
}

export function saveAutoContinue(on: boolean) {
  try {
    localStorage.setItem(AUTO_KEY, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}
