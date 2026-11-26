/** Small synthesized cues — no audio files. */
let ctx: AudioContext | null = null
let muted = (() => {
  try {
    return localStorage.getItem('quizzer.muted') === '1'
  } catch {
    return false
  }
})()

export function isMuted() {
  return muted
}
export function setMuted(m: boolean) {
  muted = m
  try {
    localStorage.setItem('quizzer.muted', m ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.12, slideTo?: number) {
  if (!ctx) return
  const t = ctx.currentTime + start
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(gain, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(ctx.destination)
  o.start(t)
  o.stop(t + dur + 0.05)
}

/** A filtered noise sweep: the card flipping over. */
function whoosh(start: number, dur: number, gain = 0.08) {
  if (!ctx) return
  const t = ctx.currentTime + start
  const len = Math.ceil(ctx.sampleRate * dur)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  const src = ctx.createBufferSource()
  src.buffer = buf
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = 1.2
  filter.frequency.setValueAtTime(400, t)
  filter.frequency.exponentialRampToValueAtTime(3200, t + dur)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(gain, t + dur * 0.4)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(filter).connect(g).connect(ctx.destination)
  src.start(t)
  src.stop(t + dur + 0.05)
}

export type Cue =
  | 'start'
  | 'select'
  | 'ringOpen'
  | 'ring'
  | 'botRing'
  | 'correct'
  | 'wrong'
  | 'timeup'
  | 'dailyDouble'
  | 'lock'
  | 'roundIntro'
  | 'reveal'
  | 'win'
  | 'lose'

/** When the chosen tile flies into the Clue card (App.tsx HIGHLIGHT_MS). */
const FLIP_AT = 1.0

export function play(cue: Cue) {
  if (muted) return
  try {
    ctx ??= new AudioContext()
  } catch {
    return // no Web Audio
  }
  if (ctx.state === 'suspended') void ctx.resume()
  switch (cue) {
    case 'start':
      tone(523, 0, 0.08, 'triangle', 0.08)
      tone(784, 0.06, 0.12, 'triangle', 0.08)
      break
    case 'select':
      // pluck on the pick, whoosh as the card flips
      tone(660, 0, 0.09, 'triangle', 0.1)
      tone(990, 0.05, 0.12, 'triangle', 0.08)
      whoosh(FLIP_AT - 0.05, 0.45)
      break
    case 'ringOpen':
      tone(1319, 0, 0.18, 'sine', 0.09)
      tone(1760, 0.08, 0.22, 'sine', 0.06)
      break
    case 'ring':
      tone(880, 0, 0.12, 'triangle')
      break
    case 'botRing':
      tone(392, 0, 0.14, 'square', 0.05)
      tone(523, 0.11, 0.18, 'square', 0.05)
      break
    case 'correct':
      tone(659, 0, 0.15)
      tone(784, 0.1, 0.15)
      tone(1047, 0.2, 0.3)
      break
    case 'wrong':
      tone(196, 0, 0.35, 'sawtooth', 0.06)
      break
    case 'timeup':
      tone(330, 0, 0.2, 'square', 0.05)
      tone(262, 0.2, 0.35, 'square', 0.05)
      break
    case 'dailyDouble':
      // after the card flips, so it lands with the reveal
      ;[523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, FLIP_AT + i * 0.07, 0.25, 'triangle'))
      break
    case 'lock':
      tone(150, 0, 0.18, 'sine', 0.2, 70)
      tone(1200, 0, 0.05, 'square', 0.03)
      break
    case 'roundIntro':
      ;[392, 523, 659, 784].forEach((f, i) => tone(f, i * 0.12, 0.3, 'triangle', 0.09))
      tone(1047, 0.5, 0.6, 'triangle', 0.09)
      break
    case 'reveal':
      tone(523, 0, 0.2, 'triangle', 0.08)
      break
    case 'win':
      ;[523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.14, 0.35, 'triangle', 0.1))
      ;[1047, 1319, 1568].forEach((f) => tone(f, 0.6, 0.9, 'sine', 0.06))
      break
    case 'lose':
      ;[440, 392, 349, 294].forEach((f, i) => tone(f, i * 0.22, 0.35, 'triangle', 0.08))
      break
  }
}
