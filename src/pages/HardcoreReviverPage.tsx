import { useState, useCallback } from 'react'
import { Upload, Download, Heart, ShieldOff, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { parseNbt, writeNbt, gunzip, gzip, isGzip, type NbtFile, type Tag } from '../tools/hardcore/nbt'

const GAMEMODES = ['Survival', 'Creative', 'Adventure', 'Spectator']

interface Loaded {
  file: NbtFile
  fileName: string
  hardcore: number | null
  gameType: number | null
  playerGameType: number | null
}

function asInt(t?: Tag): number | null { return t && (t.type === 'int' || t.type === 'byte' || t.type === 'short') ? Number(t.value) : null }

export default function HardcoreReviverPage() {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState('')
  const [disableHardcore, setDisableHardcore] = useState(true)
  const [done, setDone] = useState(false)

  const onFile = useCallback(async (file: File) => {
    setError(''); setDone(false); setLoaded(null)
    try {
      let buf: Uint8Array = new Uint8Array(await file.arrayBuffer())
      if (isGzip(buf)) buf = await gunzip(buf)
      const nbt = parseNbt(buf)
      const data = nbt.root.value['Data']
      if (!data || data.type !== 'compound') throw new Error('No "Data" tag — is this a level.dat?')
      const player = data.value['Player']
      setLoaded({
        file: nbt,
        fileName: file.name,
        hardcore: asInt(data.value['hardcore']),
        gameType: asInt(data.value['GameType']),
        playerGameType: player && player.type === 'compound' ? asInt(player.value['playerGameType']) : null,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to read file. Make sure it is a valid level.dat.')
    }
  }, [])

  async function download() {
    if (!loaded) return
    const data = loaded.file.root.value['Data']
    if (data.type !== 'compound') return

    // Revive: Survival for the world + the player
    data.value['GameType'] = { type: 'int', value: 0 }
    const player = data.value['Player']
    if (player && player.type === 'compound') player.value['playerGameType'] = { type: 'int', value: 0 }
    // Optionally clear the hardcore flag entirely
    if (disableHardcore) data.value['hardcore'] = { type: 'byte', value: 0 }

    const raw = writeNbt(loaded.file)
    const gz = await gzip(raw)
    const blob = new Blob([gz as BlobPart], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'level.dat'; a.click()
    URL.revokeObjectURL(url)
    setDone(true)
  }

  const Stat = ({ label, value, warn }: { label: string; value: string; warn?: boolean }) => (
    <div className="rounded-xl p-3" style={{ border: '1px solid rgb(var(--border))', background: 'rgb(var(--bg))' }}>
      <div className="text-xs" style={{ color: 'rgb(var(--muted))' }}>{label}</div>
      <div className="text-base font-semibold" style={{ color: warn ? 'rgb(var(--danger))' : 'rgb(var(--text))' }}>{value}</div>
    </div>
  )

  return (
    <div className="section container">
      <div className="mb-8">
        <span className="badge-accent"><Heart className="w-3.5 h-3.5" /> World Repair</span>
        <h1 className="mt-4" style={{ color: 'rgb(var(--text))' }}>Hardcore Reviver</h1>
        <p className="mt-2 text-lg" style={{ color: 'rgb(var(--muted))' }}>
          Died in hardcore and stuck in spectator? Upload your world's <span className="font-mono">level.dat</span>, and
          this puts you back into Survival — optionally turning hardcore off for good. Everything runs in your browser.
        </p>
      </div>

      <div className="card max-w-2xl">
        {/* Upload */}
        <label className="flex flex-col items-center justify-center gap-2 rounded-2xl cursor-pointer py-10 transition-all"
          style={{ border: '2px dashed rgb(var(--border))' }}>
          <Upload className="w-7 h-7" style={{ color: 'rgb(var(--accent))' }} />
          <span className="text-sm font-medium" style={{ color: 'rgb(var(--text))' }}>{loaded ? loaded.fileName : 'Choose your level.dat'}</span>
          <span className="text-xs" style={{ color: 'rgb(var(--muted))' }}>Found in <span className="font-mono">saves/&lt;world&gt;/level.dat</span></span>
          <input type="file" accept=".dat,application/octet-stream" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
        </label>

        {error && <div className="alert-danger mt-4"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{error}</div>}

        {loaded && (
          <>
            <div className="grid grid-cols-3 gap-3 mt-5">
              <Stat label="Hardcore" value={loaded.hardcore === null ? '—' : loaded.hardcore ? 'ON' : 'off'} warn={!!loaded.hardcore} />
              <Stat label="World mode" value={loaded.gameType === null ? '—' : (GAMEMODES[loaded.gameType] ?? String(loaded.gameType))} warn={loaded.gameType === 3} />
              <Stat label="Player mode" value={loaded.playerGameType === null ? '—' : (GAMEMODES[loaded.playerGameType] ?? String(loaded.playerGameType))} warn={loaded.playerGameType === 3} />
            </div>

            <label className="flex items-center gap-2.5 mt-5 cursor-pointer text-sm" style={{ color: 'rgb(var(--text))' }}>
              <input type="checkbox" checked={disableHardcore} onChange={e => setDisableHardcore(e.target.checked)} style={{ accentColor: 'rgb(var(--accent))' }} />
              <ShieldOff className="w-4 h-4" style={{ color: 'rgb(var(--muted))' }} />
              Also turn hardcore off completely <span style={{ color: 'rgb(var(--muted))' }}>(sets <span className="font-mono">Data.hardcore = 0</span> — normal hearts, no permadeath)</span>
            </label>

            <div className="mt-3 px-3 py-2 rounded-lg text-xs" style={{ background: 'rgb(var(--accent) / 0.06)', border: '1px solid rgb(var(--accent) / 0.2)', color: 'rgb(var(--muted))' }}>
              On download this sets <span className="font-mono">Data.GameType = 0</span> and <span className="font-mono">Data.Player.playerGameType = 0</span> (Survival){disableHardcore ? <>, and <span className="font-mono">Data.hardcore = 0</span></> : null}. Back up your save first, then replace the original <span className="font-mono">level.dat</span>.
            </div>

            <button onClick={download} className="btn-primary w-full mt-5 py-3">
              <Download className="w-4 h-4" /> Revive &amp; download level.dat
            </button>

            {done && <div className="flex items-center gap-2 mt-3 text-sm" style={{ color: 'rgb(var(--success))' }}><CheckCircle2 className="w-4 h-4" /> Done — drop the new level.dat into your world folder.</div>}
          </>
        )}
      </div>
    </div>
  )
}
