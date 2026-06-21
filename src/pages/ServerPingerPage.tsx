import { useState, useRef, useEffect } from 'react'
import { Search, Wifi, WifiOff, Users, Clock, Trash2, ChevronRight, Monitor, Smartphone } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────
interface ServerResult {
  online: boolean
  ip?: string
  port?: number
  hostname?: string
  version?: string
  protocol?: { version: number; name: string }
  players?: { online: number; max: number; list?: { name: string; uuid: string }[] }
  motd?: { raw: string[]; clean: string[]; html: string[] }
  icon?: string
  software?: string
  plugins?: { names: string[] }
  mods?: { names: string[] }
  gamemode?: string
  serverid?: string
}

interface HistoryEntry {
  address: string
  port: number
  type: 'java' | 'bedrock'
  label?: string
  icon?: string
  ts: number
}

// ── MOTD rendering ────────────────────────────────────────────────────────────
// The API gives us HTML with inline styles — we just render it.
// If the raw line starts with leading §f whitespace we center it.
function isRawCentered(raw: string): boolean {
  // Minecraft servers pad with spaces to center — detect leading color+spaces pattern
  return /^§[0-9a-fklmnor]\s{4,}/.test(raw) || /^\s{4,}/.test(raw)
}

function MotdLine({ html, raw }: { html: string; raw: string }) {
  const centered = isRawCentered(raw)
  return (
    <p
      className={`leading-tight text-sm font-mono ${centered ? 'text-center' : ''}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

// ── Signal bars (like the screenshot) ─────────────────────────────────────────
function SignalBars({ online }: { online: boolean }) {
  const heights = [4, 7, 10, 13]
  return (
    <div className="flex items-end gap-0.5">
      {heights.map((h, i) => (
        <div
          key={i}
          style={{
            width: 4,
            height: h,
            background: online ? '#55FF55' : '#555',
            borderRadius: 1,
          }}
        />
      ))}
    </div>
  )
}

// ── Player count bar ──────────────────────────────────────────────────────────
function PlayerBar({ online, max }: { online: number; max: number }) {
  const pct = max > 0 ? Math.min(online / max, 1) : 0
  const color = pct > 0.8 ? '#FF5555' : pct > 0.5 ? '#FFAA00' : '#55FF55'
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 rounded-full overflow-hidden" style={{ height: 4, background: 'rgb(var(--border))' }}>
        <div style={{ width: `${pct * 100}%`, height: '100%', background: color, transition: 'width 0.6s ease' }} />
      </div>
      <span className="text-xs font-mono" style={{ color: 'rgb(var(--muted))' }}>
        {online.toLocaleString()}/{max.toLocaleString()}
      </span>
    </div>
  )
}

// ── Minecraft multiplayer-style preview card ──────────────────────────────────
function ServerCard({ result, address }: { result: ServerResult; address: string }) {
  const displayName = result.hostname ?? address
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: 'rgba(0,0,0,0.85)',
        border: '1px solid rgba(255,255,255,0.08)',
        fontFamily: 'monospace',
      }}
    >
      <div className="flex items-stretch gap-0" style={{ minHeight: 80 }}>
        {/* Icon */}
        <div
          className="flex-shrink-0 flex items-center justify-center"
          style={{ width: 80, background: 'rgba(0,0,0,0.4)', borderRight: '1px solid rgba(255,255,255,0.06)' }}
        >
          {result.icon ? (
            <img src={result.icon} alt="Server icon" style={{ width: 64, height: 64, imageRendering: 'pixelated' }} />
          ) : (
            <div className="flex items-center justify-center" style={{ width: 64, height: 64, background: '#2a2a2a', borderRadius: 4 }}>
              <Wifi size={28} color="#555" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 px-4 py-3 flex flex-col justify-center gap-1">
          <div className="flex items-center justify-between">
            <span className="text-white font-bold text-sm">{displayName}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono" style={{ color: result.online ? '#55FF55' : '#FF5555' }}>
                {result.players?.online?.toLocaleString() ?? '0'}/{result.players?.max?.toLocaleString() ?? '0'}
              </span>
              <SignalBars online={result.online} />
            </div>
          </div>

          {/* MOTD */}
          <div style={{ opacity: 0.9 }}>
            {result.motd?.html?.map((line, i) => (
              <MotdLine key={i} html={line} raw={result.motd?.raw?.[i] ?? ''} />
            )) ?? (
              <p className="text-sm font-mono" style={{ color: '#AAAAAA' }}>A Minecraft Server</p>
            )}
          </div>
        </div>

        {/* Right side: version */}
        <div
          className="flex-shrink-0 flex flex-col items-end justify-between px-3 py-3"
          style={{ borderLeft: '1px solid rgba(255,255,255,0.06)', minWidth: 100 }}
        >
          <span className="text-xs font-mono" style={{ color: '#AAAAAA' }}>
            {result.version ?? result.protocol?.name ?? ''}
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-semibold"
            style={{
              background: result.online ? 'rgba(85,255,85,0.15)' : 'rgba(255,85,85,0.15)',
              color: result.online ? '#55FF55' : '#FF5555',
            }}
          >
            {result.online ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Detail panel ──────────────────────────────────────────────────────────────
function DetailPanel({ result, address }: { result: ServerResult; address: string }) {
  if (!result.online) {
    return (
      <div className="card p-6 flex flex-col items-center gap-3 text-center">
        <WifiOff size={40} style={{ color: 'rgb(var(--muted))' }} />
        <p className="font-semibold text-lg">Server Offline</p>
        <p className="text-sm" style={{ color: 'rgb(var(--muted))' }}>
          {address} is not responding. It may be down, firewalled, or the address is incorrect.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Status row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Status', value: result.online ? 'Online' : 'Offline', accent: result.online ? '#55FF55' : '#FF5555' },
          { label: 'Players', value: `${(result.players?.online ?? 0).toLocaleString()} / ${(result.players?.max ?? 0).toLocaleString()}` },
          { label: 'Version', value: result.version ?? result.protocol?.name ?? 'Unknown' },
          { label: 'Protocol', value: result.protocol?.version != null ? `v${result.protocol.version}` : '—' },
        ].map(item => (
          <div key={item.label} className="card p-3 flex flex-col gap-1">
            <span className="text-xs uppercase tracking-widest font-semibold" style={{ color: 'rgb(var(--muted))' }}>
              {item.label}
            </span>
            <span className="font-semibold text-sm" style={{ color: item.accent }}>
              {item.value}
            </span>
          </div>
        ))}
      </div>

      {/* Player bar */}
      {result.players && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users size={14} style={{ color: 'rgb(var(--muted))' }} />
            <span className="text-xs uppercase tracking-widest font-semibold" style={{ color: 'rgb(var(--muted))' }}>
              Player Capacity
            </span>
          </div>
          <PlayerBar online={result.players.online} max={result.players.max} />
          {result.players.list && result.players.list.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {result.players.list.slice(0, 20).map(p => (
                <span
                  key={p.uuid}
                  className="text-xs px-2 py-0.5 rounded-full font-mono"
                  style={{ background: 'rgb(var(--border))', color: 'rgb(var(--text))' }}
                >
                  {p.name}
                </span>
              ))}
              {result.players.list.length > 20 && (
                <span className="text-xs px-2 py-0.5 rounded-full font-mono" style={{ background: 'rgb(var(--border))', color: 'rgb(var(--muted))' }}>
                  +{result.players.list.length - 20} more
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Software / mods / plugins */}
      {(result.software || result.plugins || result.mods || result.gamemode) && (
        <div className="card p-4 grid grid-cols-2 gap-4">
          {result.software && (
            <div>
              <p className="text-xs uppercase tracking-widest font-semibold mb-1" style={{ color: 'rgb(var(--muted))' }}>Software</p>
              <p className="text-sm font-mono">{result.software}</p>
            </div>
          )}
          {result.gamemode && (
            <div>
              <p className="text-xs uppercase tracking-widest font-semibold mb-1" style={{ color: 'rgb(var(--muted))' }}>Gamemode</p>
              <p className="text-sm font-mono">{result.gamemode}</p>
            </div>
          )}
          {result.plugins?.names && result.plugins.names.length > 0 && (
            <div className="col-span-2">
              <p className="text-xs uppercase tracking-widest font-semibold mb-1" style={{ color: 'rgb(var(--muted))' }}>Plugins ({result.plugins.names.length})</p>
              <div className="flex flex-wrap gap-1">
                {result.plugins.names.map(n => (
                  <span key={n} className="text-xs px-2 py-0.5 rounded font-mono" style={{ background: 'rgb(var(--border))' }}>{n}</span>
                ))}
              </div>
            </div>
          )}
          {result.mods?.names && result.mods.names.length > 0 && (
            <div className="col-span-2">
              <p className="text-xs uppercase tracking-widest font-semibold mb-1" style={{ color: 'rgb(var(--muted))' }}>Mods ({result.mods.names.length})</p>
              <div className="flex flex-wrap gap-1">
                {result.mods.names.slice(0, 30).map(n => (
                  <span key={n} className="text-xs px-2 py-0.5 rounded font-mono" style={{ background: 'rgb(var(--border))' }}>{n}</span>
                ))}
                {result.mods.names.length > 30 && (
                  <span className="text-xs px-2 py-0.5 rounded font-mono" style={{ background: 'rgb(var(--border))', color: 'rgb(var(--muted))' }}>
                    +{result.mods.names.length - 30} more
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Connection info */}
      <div className="card p-4">
        <p className="text-xs uppercase tracking-widest font-semibold mb-2" style={{ color: 'rgb(var(--muted))' }}>Connection</p>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm font-mono">
          {result.ip && <span><span style={{ color: 'rgb(var(--muted))' }}>IP: </span>{result.ip}</span>}
          {result.port && <span><span style={{ color: 'rgb(var(--muted))' }}>Port: </span>{result.port}</span>}
          {result.hostname && <span><span style={{ color: 'rgb(var(--muted))' }}>Hostname: </span>{result.hostname}</span>}
        </div>
      </div>
    </div>
  )
}

// ── History storage ───────────────────────────────────────────────────────────
const HISTORY_KEY = 'mctools_server_history'

function loadHistory(): HistoryEntry[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') } catch { return [] }
}
function saveHistory(h: HistoryEntry[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 20)))
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ServerPingerPage() {
  const [address, setAddress] = useState('')
  const [port, setPort] = useState('25565')
  const [type, setType] = useState<'java' | 'bedrock'>('java')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ServerResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory)
  const [pinnedAddress, setPinnedAddress] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  async function ping(addr = address, p = port, t = type) {
    const trimmed = addr.trim()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    setResult(null)
    setPinnedAddress(trimmed)

    try {
      const portNum = parseInt(p) || 25565
      const portSuffix = (t === 'java' && portNum === 25565) || (t === 'bedrock' && portNum === 19132) ? '' : `:${portNum}`
      const apiBase = t === 'bedrock' ? 'https://api.mcsrvstat.us/bedrock/3' : 'https://api.mcsrvstat.us/3'
      const url = `${apiBase}/${trimmed}${portSuffix}`

      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: ServerResult = await res.json()
      setResult(data)

      // Update history
      const entry: HistoryEntry = {
        address: trimmed,
        port: portNum,
        type: t,
        label: data.hostname ?? trimmed,
        icon: data.icon,
        ts: Date.now(),
      }
      setHistory(prev => {
        const filtered = prev.filter(h => !(h.address === trimmed && h.type === t))
        const next = [entry, ...filtered]
        saveHistory(next)
        return next
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reach the API. Check your connection.')
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    ping()
  }

  function clearHistory() {
    setHistory([])
    saveHistory([])
  }

  return (
    <div className="section py-10">
      <div className="container max-w-3xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-1">Server Pinger</h1>
          <p className="text-sm" style={{ color: 'rgb(var(--muted))' }}>
            Check any Java or Bedrock Minecraft server — status, MOTD, players, and more.
          </p>
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="card p-4 mb-6">
          <div className="flex gap-2 flex-wrap">
            <input
              ref={inputRef}
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="mc.hypixel.net"
              className="flex-1 min-w-0 px-3 py-2 rounded-lg text-sm font-mono outline-none"
              style={{
                background: 'rgb(var(--bg))',
                border: '1px solid rgb(var(--border))',
                color: 'rgb(var(--text))',
                minWidth: 180,
              }}
            />
            <input
              value={port}
              onChange={e => setPort(e.target.value)}
              placeholder="25565"
              className="w-24 px-3 py-2 rounded-lg text-sm font-mono outline-none"
              style={{
                background: 'rgb(var(--bg))',
                border: '1px solid rgb(var(--border))',
                color: 'rgb(var(--text))',
              }}
            />
            {/* Java / Bedrock toggle */}
            <div
              className="flex rounded-lg overflow-hidden"
              style={{ border: '1px solid rgb(var(--border))' }}
            >
              {(['java', 'bedrock'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className="px-3 py-2 text-sm font-semibold capitalize transition-colors"
                  style={{
                    background: type === t ? 'rgb(var(--accent))' : 'transparent',
                    color: type === t ? 'white' : 'rgb(var(--muted))',
                  }}
                >
                  {t === 'java' ? <Monitor size={13} /> : <Smartphone size={13} />}
                  {t === 'java' ? 'Java' : 'Bedrock'}
                </button>
              ))}
            </div>
            <button
              type="submit"
              disabled={loading || !address.trim()}
              className="btn btn-primary px-5 py-2 text-sm font-semibold gap-2 disabled:opacity-50"
            >
              {loading ? (
                <svg className="animate-spin" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx={12} cy={12} r={10} opacity={0.25} />
                  <path d="M12 2a10 10 0 0 1 10 10" />
                </svg>
              ) : (
                <Search size={15} />
              )}
              {loading ? 'Pinging…' : 'Ping Server'}
            </button>
          </div>
        </form>

        {/* Error */}
        {error && (
          <div
            className="card p-4 mb-6 flex items-center gap-3"
            style={{ borderColor: 'rgba(255,85,85,0.4)', background: 'rgba(255,85,85,0.07)' }}
          >
            <WifiOff size={18} color="#FF5555" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="space-y-4 mb-8">
            {/* MC-style card */}
            <ServerCard result={result} address={pinnedAddress} />
            {/* Detail */}
            <DetailPanel result={result} address={pinnedAddress} />
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Clock size={14} style={{ color: 'rgb(var(--muted))' }} />
                <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: 'rgb(var(--muted))' }}>
                  History
                </p>
              </div>
              <button
                onClick={clearHistory}
                className="btn btn-ghost px-2 py-1 text-xs gap-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <Trash2 size={12} /> Clear
              </button>
            </div>
            <div className="space-y-1.5">
              {history.map(h => (
                <button
                  key={`${h.type}:${h.address}:${h.port}`}
                  onClick={() => {
                    setAddress(h.address)
                    setPort(String(h.port))
                    setType(h.type)
                    ping(h.address, String(h.port), h.type)
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all text-left"
                  style={{ border: '1px solid rgb(var(--border))' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgb(var(--accent))')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgb(var(--border))')}
                >
                  {h.icon ? (
                    <img src={h.icon} alt="" style={{ width: 32, height: 32, imageRendering: 'pixelated', borderRadius: 3 }} />
                  ) : (
                    <div style={{ width: 32, height: 32, background: 'rgb(var(--border))', borderRadius: 3 }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{h.label ?? h.address}</p>
                    <p className="text-xs font-mono truncate" style={{ color: 'rgb(var(--muted))' }}>
                      {h.address}{h.port !== 25565 && h.type === 'java' ? `:${h.port}` : ''}
                      {' · '}{h.type}
                    </p>
                  </div>
                  <ChevronRight size={14} style={{ color: 'rgb(var(--muted))', flexShrink: 0 }} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
