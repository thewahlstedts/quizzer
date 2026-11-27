/**
 * Estimates the server's clock from ping/pong round trips, so countdowns (which carry server
 * timestamps) show the right time on every device.
 *
 * For one round trip sent at `sent` and received at `received` (client clock) with the server
 * stamping `serverTime`, the server's clock is ahead by about serverTime - (sent + received) / 2,
 * wrong by at most half the round trip. So we trust the sample with the shortest round trip
 * among the most recent few.
 */
export class ClockSync {
  private samples: { rtt: number; offset: number }[] = []

  constructor(private readonly keep = 8) {}

  add(sent: number, serverTime: number, received: number): void {
    const rtt = received - sent
    if (rtt < 0) return
    this.samples.push({ rtt, offset: serverTime - (sent + received) / 2 })
    if (this.samples.length > this.keep) this.samples.shift()
  }

  /** How far the server's clock is ahead of ours (ms); 0 until the first sample. */
  get offset(): number {
    return this.best()?.offset ?? 0
  }

  /** The shortest recent round trip (ms), or null with no samples yet. */
  get rtt(): number | null {
    return this.best()?.rtt ?? null
  }

  get synced(): boolean {
    return this.samples.length > 0
  }

  /** Server time now, by our estimate. */
  serverNow(clientNow: number): number {
    return clientNow + this.offset
  }

  private best() {
    let best: { rtt: number; offset: number } | undefined
    for (const s of this.samples) if (!best || s.rtt < best.rtt) best = s
    return best
  }
}
