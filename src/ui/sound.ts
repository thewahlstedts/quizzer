/** Small synthesized cues — no audio files. */
let ctx: AudioContext | null = null
let muted = localStorage.getItem('quizzer.muted') === '1'

export function isMuted() {
  return muted
}
export function setMuted(m: boolean) {
  muted = m
  localStorage.setItem('quizzer.muted', m ? '1' : '0')
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.12) {
  if (!ctx) return
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.value = freq
  g.gain.setValueAtTime(0, ctx.currentTime + start)
  g.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur)
  o.connect(g).connect(ctx.destination)
  o.start(ctx.currentTime + start)
  o.stop(ctx.currentTime + start + dur + 0.05)
}

export type Cue = 'ring' | 'correct' | 'wrong' | 'timeup' | 'dailyDouble' | 'reveal'

export function play(cue: Cue) {
  if (muted) return
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  switch (cue) {
    case 'ring':
      tone(880, 0, 0.12, 'triangle')
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
      ;[523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.07, 0.25, 'triangle'))
      break
    case 'reveal':
      tone(523, 0, 0.2, 'triangle', 0.08)
      break
  }
}
