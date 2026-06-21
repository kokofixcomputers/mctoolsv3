import { useState, useRef, useEffect } from 'react'
import { Download, Upload, User, AlertTriangle } from 'lucide-react'
import { generateTotemFromFile, generateTotemFromUsername, generatePackFromFile, generatePackFromUsername } from '../tools/totem/generator'

type Mode = 'username' | 'file'

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function TotemPage() {
  const [mode, setMode] = useState<Mode>('username')
  const [username, setUsername] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [resultBlob, setResultBlob] = useState<Blob | null>(null)
  const [packBlob, setPackBlob] = useState<Blob | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  async function generate() {
    setLoading(true); setError(''); setPreviewUrl(null); setResultBlob(null); setPackBlob(null)
    try {
      let canvas: HTMLCanvasElement; let blob: Blob; let pack: Blob
      if (mode === 'username') {
        if (!username.trim()) throw new Error('Enter a username')
        ;({ canvas, blob } = await generateTotemFromUsername(username.trim()))
        pack = await generatePackFromUsername(username.trim())
      } else {
        if (!file) throw new Error('Select a skin file')
        ;({ canvas, blob } = await generateTotemFromFile(file))
        pack = await generatePackFromFile(file)
      }
      const preview = document.createElement('canvas')
      preview.width = 160; preview.height = 160
      const pctx = preview.getContext('2d')!
      pctx.imageSmoothingEnabled = false
      pctx.drawImage(canvas, 0, 0, 160, 160)
      setPreviewUrl(preview.toDataURL('image/png'))
      setResultBlob(blob)
      setPackBlob(pack)
    } catch (e) { setError(e instanceof Error ? e.message : 'Unknown error') }
    setLoading(false)
  }

  return (
    <div className="section container">
      <div className="mb-10">
        <span className="badge-muted">Tool</span>
        <h1 className="mt-4" style={{ color: 'rgb(var(--text))' }}>Totem Generator</h1>
        <p className="mt-2 text-lg" style={{ color: 'rgb(var(--muted))' }}>
          Generate a custom Totem of Undying resource pack from any Minecraft skin.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="card space-y-5">
            <h3>Skin Source</h3>
            <div className="tab-nav w-fit">
              <button onClick={() => setMode('username')} className={mode === 'username' ? 'tab-active flex items-center gap-1.5' : 'tab flex items-center gap-1.5'}>
                <User className="w-3.5 h-3.5" /> Username
              </button>
              <button onClick={() => setMode('file')} className={mode === 'file' ? 'tab-active flex items-center gap-1.5' : 'tab flex items-center gap-1.5'}>
                <Upload className="w-3.5 h-3.5" /> Upload File
              </button>
            </div>

            {mode === 'username' ? (
              <div>
                <label className="form-label">Minecraft Username</label>
                <input className="form-input" value={username} onChange={(e) => setUsername(e.target.value)}
                  placeholder="Notch" onKeyDown={(e) => e.key === 'Enter' && generate()} />
                <p className="text-xs mt-1.5" style={{ color: 'rgb(var(--muted))' }}>Java Edition. Fetches skin from Mojang API.</p>
              </div>
            ) : (
              <div>
                <label className="form-label">Skin PNG File</label>
                <input type="file" accept="image/png" className="form-input text-sm cursor-pointer"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                <p className="text-xs mt-1.5" style={{ color: 'rgb(var(--muted))' }}>64×64 or 64×32 Minecraft skin PNG.</p>
              </div>
            )}

            <button className="btn-primary w-full py-3" onClick={generate} disabled={loading}>
              {loading ? 'Generating…' : 'Generate Totem'}
            </button>
            {error && <div className="alert-danger"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{error}</div>}
          </div>

          <div className="card text-sm" style={{ color: 'rgb(var(--muted))' }}>
            <h3 className="mb-2" style={{ color: 'rgb(var(--text))' }}>About the technique</h3>
            <p className="mb-2">Uses the <em>wavy totem</em> layering method: head, torso, hands, and legs are mapped onto the 16×16 canvas with rotation and resizing.</p>
            <p>Supports slim (Alex) and classic (Steve) models, plus second-layer overlays.</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card">
            <h3 className="mb-5">Preview</h3>
            {previewUrl ? (
              <div className="flex flex-col items-center gap-5">
                <div className="rounded-2xl p-4" style={{ backgroundColor: 'rgb(var(--bg))', border: '1px solid rgb(var(--border))' }}>
                  <img src={previewUrl} alt="Totem preview" className="pixelated rounded-lg" style={{ width: 160, height: 160 }} />
                </div>
                <div className="flex gap-3 flex-wrap justify-center">
                  <button className="btn-secondary flex items-center gap-2"
                    onClick={() => resultBlob && downloadBlob(resultBlob, 'totem_of_undying.png')}>
                    <Download className="w-4 h-4" /> PNG only
                  </button>
                  <button className="btn-primary flex items-center gap-2"
                    onClick={() => packBlob && downloadBlob(packBlob, 'totem-pack.zip')}>
                    <Download className="w-4 h-4" /> Resource Pack (.zip)
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-52 rounded-xl gap-3"
                style={{ border: '2px dashed rgb(var(--border))', color: 'rgb(var(--muted))' }}>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: 'rgb(var(--border) / 0.4)' }}>
                  <Upload className="w-5 h-5" />
                </div>
                <span className="text-sm">Preview will appear here</span>
              </div>
            )}
          </div>

          <div className="card text-sm">
            <h3 className="mb-3">How to install</h3>
            <ol className="space-y-1.5 list-decimal list-inside" style={{ color: 'rgb(var(--muted))' }}>
              <li>Download the resource pack ZIP</li>
              <li>Open Minecraft → Options → Resource Packs</li>
              <li>Click "Open Pack Folder"</li>
              <li>Drop the ZIP into the folder</li>
              <li>Enable the pack in-game</li>
            </ol>
          </div>
        </div>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}
