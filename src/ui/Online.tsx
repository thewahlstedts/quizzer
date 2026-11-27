import { useState } from 'react'
import { GAME_MODES, type BotDifficulty, type Level } from '../engine/types'
import type { RoomSettings } from '../net/protocol'
import { MODE_LABEL } from './format'
import type { OnlineGame } from './useOnlineGame'

/** A Room code from the page's link (?room=ABCD), so a shared link fills in the code. */
export function roomFromLink(): string {
  try {
    return (new URLSearchParams(location.search).get('room') ?? '').trim().toUpperCase().slice(0, 8)
  } catch {
    return ''
  }
}

export function roomLink(code: string): string {
  return `${location.origin}${location.pathname}?room=${encodeURIComponent(code)}`
}

/** On the start screen: create a Room, or join one with its code. */
export function PlayWithFriends({ name, online }: { name: string; online: Pick<OnlineGame, 'create' | 'join'> }) {
  const [code, setCode] = useState(roomFromLink)
  const who = name.trim() || 'Player'
  return (
    <section className="setup-card online-card">
      <h2>Play with friends</h2>
      <p className="hint">Up to three people, each on their own device. Bots fill any empty seats.</p>
      <button className="primary" onClick={() => online.create(who)}>
        Create a room
      </button>
      <form
        className="join-row"
        onSubmit={(e) => {
          e.preventDefault()
          if (code.trim()) online.join(code, who)
        }}
      >
        <input
          aria-label="Room code"
          placeholder="Room code"
          value={code}
          maxLength={8}
          autoCapitalize="characters"
          autoComplete="off"
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        <button className="ghost" type="submit" disabled={!code.trim()}>
          Join
        </button>
      </form>
    </section>
  )
}

/** The Room before (and between) games: who's here, the Host's settings, and Start. */
export function Lobby({ online }: { online: OnlineGame }) {
  const { lobby, you, error } = online
  const [copied, setCopied] = useState(false)

  if (online.unreachable) {
    return (
      <main className="setup">
        <section className="setup-card lobby">
          <h2>Can't reach the game server</h2>
          <p className="hint">Online play needs a connection to the server, and it didn't answer. Try again in a bit.</p>
          <button className="primary" onClick={online.leave}>
            Back
          </button>
        </section>
      </main>
    )
  }

  if (!lobby || !you) {
    return (
      <main className="setup">
        <section className="setup-card lobby">
          {online.seatLost ? (
            <>
              <h2>That game has ended</h2>
              <p className="hint">The room is gone, most likely because the game server restarted. Create a new room to play again.</p>
            </>
          ) : error ? (
            <>
              <h2>Couldn't join</h2>
              <p className="error">{error.message}</p>
            </>
          ) : (
            <h2>Connecting…</h2>
          )}
          <button className="ghost" onClick={online.leave}>
            Back
          </button>
        </section>
      </main>
    )
  }

  const isHost = lobby.host === you
  const s = lobby.settings
  const set = (patch: Partial<RoomSettings>) => online.changeSettings({ ...s, ...patch })
  const link = roomLink(lobby.code)
  const bots = 3 - lobby.members.length

  return (
    <main className="setup">
      <section className="setup-card lobby">
        <p className="eyebrow">Room</p>
        <h2 className="room-code" aria-label={`Room code ${lobby.code.split('').join(' ')}`}>
          {lobby.code}
        </h2>
        <div className="row">
          <button
            className="ghost"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link)
                setCopied(true)
              } catch {
                setCopied(false)
              }
            }}
          >
            {copied ? 'Link copied ✓' : 'Copy invite link'}
          </button>
        </div>
        {online.reconnecting && <p className="hint">Reconnecting…</p>}
        {error && <p className="error">{error.message}</p>}

        <ul className="members">
          {lobby.members.map((m) => (
            <li key={m.id} className={m.connected ? '' : 'away'}>
              <span className="who">
                {m.name}
                {m.id === you ? ' (you)' : ''}
              </span>
              {m.id === lobby.host && <span className="tag">Host</span>}
              {!m.connected && <span className="tag">away</span>}
            </li>
          ))}
          {bots > 0 && (
            <li className="bots">
              + {bots} Bot{bots > 1 ? 's' : ''}
            </li>
          )}
        </ul>

        <div className="field">
          <span>Level</span>
          <div className="segmented">
            {([1, 2, 3, 4] as Level[]).map((l) => (
              <button key={l} className={l === s.level ? 'on' : ''} disabled={!isHost} onClick={() => set({ level: l })}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Bot difficulty</span>
          <div className="segmented">
            {(['easy', 'normal', 'hard'] as BotDifficulty[]).map((d) => (
              <button key={d} className={d === s.difficulty ? 'on' : ''} disabled={!isHost} onClick={() => set({ difficulty: d })}>
                {d[0].toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Mode</span>
          <div className="segmented">
            {GAME_MODES.map((m) => (
              <button key={m} className={m === s.mode ? 'on' : ''} disabled={!isHost} onClick={() => set({ mode: m })}>
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>
        </div>

        {isHost ? (
          <button className="primary big" onClick={online.start}>
            {online.state ? 'Play again' : 'Start game'}
          </button>
        ) : (
          <p className="hint">Waiting for {lobby.members.find((m) => m.id === lobby.host)?.name ?? 'the host'} to start…</p>
        )}
        <button className="ghost" onClick={online.leave}>
          Leave room
        </button>
      </section>
    </main>
  )
}
