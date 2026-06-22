import { useState, useRef } from 'react'
import { Search, Copy, Check, ExternalLink, User } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SkinInfo {
  url: string
  slim: boolean
}

interface CapeInfo {
  url: string
}

interface PlayerData {
  uuid: string          // with dashes
  uuidRaw: string       // without dashes
  name: string
  skin: SkinInfo | null
  cape: CapeInfo | null
  createdAt: string | null
  nameHistory: string[]
}

// ── Ashcon API (CORS-friendly Mojang mirror) ───────────────────────────────────

interface AshconResponse {
  uuid: string
  username: string
  username_history?: { username: string; changed_at?: string }[]
  textures?: {
    slim?: boolean
    skin?: { url: string }
    cape?: { url: string }
  }
  created_at?: string
}

async function lookupPlayer(username: string): Promise<PlayerData> {
  const res = await fetch(`https://api.ashcon.app/mojang/v2/user/${encodeURIComponent(username)}`)
  if (res.status === 404) throw new Error(`Player "${username}" not found.`)
  if (!res.ok) {
    // fallback: playerdb.co
    const res2 = await fetch(`https://playerdb.co/api/player/minecraft/${encodeURIComponent(username)}`)
    if (!res2.ok) throw new Error(`Could not look up "${username}" (API error ${res.status}).`)
    const j2 = await res2.json() as { data?: { player?: { id?: string; raw_id?: string; username?: string } } }
    const p = j2.data?.player
    if (!p?.id) throw new Error(`Player "${username}" not found.`)
    return {
      uuid: p.id,
      uuidRaw: p.raw_id ?? p.id.replace(/-/g, ''),
      name: p.username ?? username,
      skin: null,
      cape: null,
      createdAt: null,
      nameHistory: [],
    }
  }

  const d = await res.json() as AshconResponse
  const uuidRaw = d.uuid.replace(/-/g, '')

  return {
    uuid: d.uuid,
    uuidRaw,
    name: d.username,
    skin: d.textures?.skin ? { url: d.textures.skin.url, slim: d.textures.slim ?? false } : null,
    cape: d.textures?.cape ? { url: d.textures.cape.url } : null,
    createdAt: d.created_at ?? null,
    nameHistory: (d.username_history ?? []).map(h => h.username).reverse(),
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function CopyBtn({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      }}
      title="Copy"
      className={`btn-ghost p-1.5 flex items-center gap-1 text-xs ${className ?? ''}`}
    >
      {copied
        ? <><Check className="w-3.5 h-3.5" />Copied</>
        : <><Copy className="w-3.5 h-3.5" />Copy</>}
    </button>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5" style={{ borderBottom: '1px solid rgb(var(--border) / 0.5)' }}>
      <span className="text-sm" style={{ color: 'rgb(var(--muted))', flexShrink: 0 }}>{label}</span>
      <div className="flex items-center gap-1 min-w-0">
        <span
          className={`text-sm truncate ${mono ? 'font-mono' : ''}`}
          style={{ color: 'rgb(var(--text))' }}
          title={value}
        >
          {value}
        </span>
        <CopyBtn text={value} />
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function PlayerLookupPage() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [player, setPlayer] = useState<PlayerData | null>(null)
  const [bodyAngle, setBodyAngle] = useState<'front' | 'back' | 'left' | 'right'>('front')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleLookup(username = query.trim()) {
    if (!username) return
    setLoading(true)
    setError(null)
    setPlayer(null)
    try {
      const data = await lookupPlayer(username)
      setPlayer(data)
      setBodyAngle('front')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  function bodyUrl(uuid: string, angle: 'front' | 'back' | 'left' | 'right') {
    const angleMap = { front: 0, back: 180, left: 90, right: 270 }
    return `https://visage.surgeplay.com/full/256/${uuid}?y=${angleMap[angle]}`
  }

  return (
    <div className="section container">
      {/* Header */}
      <div className="mb-10">
        <span className="badge-muted">Tool</span>
        <h1 className="mt-4" style={{ color: 'rgb(var(--text))' }}>Player Lookup</h1>
        <p className="mt-2 text-lg" style={{ color: 'rgb(var(--muted))' }}>
          Look up any Java Edition player's UUID, skin, and profile info from Mojang.
        </p>
      </div>

      {/* Search bar */}
      <div className="max-w-xl mb-8">
        <form
          onSubmit={e => { e.preventDefault(); handleLookup() }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'rgb(var(--muted))' }} />
            <input
              ref={inputRef}
              className="form-input pl-9 text-base"
              placeholder="Enter username…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
            style={{ backgroundColor: 'rgb(var(--accent))', color: 'rgb(var(--accent-fg, #fff))' }}
          >
            {loading ? 'Looking up…' : 'Look up'}
          </button>
        </form>
      </div>

      {/* Error */}
      {error && (
        <div className="max-w-xl rounded-xl px-4 py-3 text-sm mb-6" style={{ backgroundColor: 'rgb(220 38 38 / 0.1)', border: '1px solid rgb(220 38 38 / 0.25)', color: 'rgb(220 38 38)' }}>
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="flex gap-8 max-w-3xl animate-pulse">
          <div className="rounded-2xl" style={{ width: 180, height: 360, background: 'rgb(var(--border) / 0.4)' }} />
          <div className="flex-1 space-y-4 pt-2">
            <div className="h-8 w-48 rounded-xl" style={{ background: 'rgb(var(--border) / 0.4)' }} />
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-5 rounded-lg" style={{ background: 'rgb(var(--border) / 0.3)', width: `${60 + i * 7}%` }} />
            ))}
          </div>
        </div>
      )}

      {/* Result */}
      {player && !loading && (
        <div className="flex flex-col lg:flex-row gap-8 max-w-4xl">

          {/* ── 3D body render ── */}
          <div className="flex flex-col items-center gap-3" style={{ flexShrink: 0 }}>
            <div
              className="rounded-2xl overflow-hidden flex items-center justify-center"
              style={{
                width: 200, height: 380,
                background: 'rgb(var(--bg-card, var(--bg)) / 0.6)',
                border: '1px solid rgb(var(--border))',
                backdropFilter: 'blur(8px)',
              }}
            >
              <img
                key={`${player.uuid}-${bodyAngle}`}
                src={bodyUrl(player.uuid, bodyAngle)}
                alt={`${player.name} 3D render`}
                style={{ width: 180, height: 360, imageRendering: 'pixelated', objectFit: 'contain' }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            </div>

            {/* Angle buttons */}
            <div className="flex gap-1">
              {(['front', 'back', 'left', 'right'] as const).map(angle => (
                <button
                  key={angle}
                  onClick={() => setBodyAngle(angle)}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium capitalize transition-all"
                  style={{
                    border: `1px solid ${bodyAngle === angle ? 'rgb(var(--accent))' : 'rgb(var(--border))'}`,
                    backgroundColor: bodyAngle === angle ? 'rgb(var(--accent) / 0.1)' : 'transparent',
                    color: bodyAngle === angle ? 'rgb(var(--accent))' : 'rgb(var(--muted))',
                  }}
                >
                  {angle}
                </button>
              ))}
            </div>
          </div>

          {/* ── Info panel ── */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* Name + head */}
            <div className="flex items-center gap-4 mb-6">
              <img
                src={`https://crafatar.com/avatars/${player.uuid}?size=64&overlay`}
                alt={player.name}
                style={{ width: 64, height: 64, imageRendering: 'pixelated', borderRadius: 8 }}
              />
              <div>
                <h2 className="text-3xl font-bold" style={{ color: 'rgb(var(--text))', fontFamily: 'monospace' }}>
                  {player.name}
                </h2>
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium mt-1 inline-block"
                  style={{ background: 'rgb(var(--accent) / 0.1)', color: 'rgb(var(--accent))' }}
                >
                  Java Edition
                </span>
              </div>
            </div>

            {/* Profile info card */}
            <div className="card" style={{ padding: '0.5rem 1rem' }}>
              <InfoRow label="Username" value={player.name} />
              <InfoRow label="UUID" value={player.uuid} mono />
              <InfoRow label="UUID (raw)" value={player.uuidRaw} mono />
              <InfoRow label="Skin model" value={player.skin?.slim ? 'Alex (slim)' : 'Steve (classic)'} />
              <InfoRow label="Cape" value={player.cape ? 'Yes' : 'None'} />
              {player.createdAt && (
                <InfoRow label="Account created" value={new Date(player.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })} />
              )}
            </div>

            {/* Skin / cape texture links */}
            <div className="card space-y-3">
              <h3 className="text-sm font-semibold" style={{ color: 'rgb(var(--text))' }}>Textures</h3>

              {player.skin && (
                <div className="flex items-center gap-3">
                  <img
                    src={`https://crafatar.com/skins/${player.uuid}`}
                    alt="skin"
                    style={{ width: 32, height: 32, imageRendering: 'pixelated', borderRadius: 4 }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm" style={{ color: 'rgb(var(--text))' }}>Skin</div>
                    <div className="text-xs truncate font-mono" style={{ color: 'rgb(var(--muted))' }} title={player.skin.url}>{player.skin.url}</div>
                  </div>
                  <a href={player.skin.url} target="_blank" rel="noreferrer" title="Open skin PNG" style={{ color: 'rgb(var(--muted))' }}>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <CopyBtn text={player.skin.url} />
                </div>
              )}

              {player.cape && (
                <div className="flex items-center gap-3">
                  <img
                    src={player.cape.url}
                    alt="cape"
                    style={{ width: 20, height: 32, imageRendering: 'pixelated', borderRadius: 4 }}
                    crossOrigin="anonymous"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm" style={{ color: 'rgb(var(--text))' }}>Cape</div>
                    <div className="text-xs truncate font-mono" style={{ color: 'rgb(var(--muted))' }} title={player.cape.url}>{player.cape.url}</div>
                  </div>
                  <a href={player.cape.url} target="_blank" rel="noreferrer" title="Open cape PNG" style={{ color: 'rgb(var(--muted))' }}>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <CopyBtn text={player.cape.url} />
                </div>
              )}

              {!player.skin && !player.cape && (
                <p className="text-sm" style={{ color: 'rgb(var(--muted))' }}>No texture data available.</p>
              )}
            </div>

            {/* Name history */}
            {player.nameHistory.length > 1 && (
              <div className="card space-y-2">
                <h3 className="text-sm font-semibold" style={{ color: 'rgb(var(--text))' }}>
                  Name History
                  <span className="ml-1.5 text-xs font-normal" style={{ color: 'rgb(var(--muted))' }}>{player.nameHistory.length}</span>
                </h3>
                <div className="space-y-1">
                  {player.nameHistory.map((n, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="font-mono" style={{ color: 'rgb(var(--text))' }}>{n}</span>
                      {i === 0 && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgb(var(--accent) / 0.1)', color: 'rgb(var(--accent))' }}>
                          current
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* External links */}
            <div className="card space-y-2">
              <h3 className="text-sm font-semibold mb-1" style={{ color: 'rgb(var(--text))' }}>View on</h3>
              {[
                { label: 'NameMC', href: `https://namemc.com/profile/${player.uuidRaw}` },
                { label: 'Crafatar', href: `https://crafatar.com/renders/body/${player.uuid}?overlay` },
                { label: 'Laby.net', href: `https://laby.net/@${player.name}` },
              ].map(({ label, href }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 text-sm transition-colors"
                  style={{ color: 'rgb(var(--accent))' }}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  {label}
                </a>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* Empty state */}
      {!player && !loading && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-center" style={{ color: 'rgb(var(--muted))' }}>
          <User className="w-12 h-12 mb-4 opacity-30" />
          <p className="text-sm">Enter a Java Edition username to look up their profile.</p>
        </div>
      )}
    </div>
  )
}
