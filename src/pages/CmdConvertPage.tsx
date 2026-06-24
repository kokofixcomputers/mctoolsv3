import { useState } from 'react'
import { ArrowRight, Copy, Check, RefreshCw, Repeat2 } from 'lucide-react'
import { convertCommand } from '../tools/cmdconvert/convert'

const EXAMPLES = [
  {
    label: 'Player head',
    cmd: `/give @p player_head{SkullOwner:{Name:"Notch",Properties:{textures:[{Value:"eyJ0ZXh0dXJlcyI6e319"}]}}}`,
  },
  {
    label: 'Custom potion',
    cmd: `/give @p potion{Potion:"minecraft:strong_healing",CustomPotionColor:16711680,CustomPotionEffects:[{id:"minecraft:regeneration",Amplifier:1b,Duration:200}]}`,
  },
  {
    label: 'Filled shulker box',
    cmd: `/give @p shulker_box{BlockEntityTag:{Items:[{Slot:0b,id:"minecraft:diamond",Count:64b},{Slot:1b,id:"minecraft:emerald",Count:16b}]}}`,
  },
  {
    label: 'Leather chestplate',
    cmd: `/give @s leather_chestplate{display:{color:11546150,Lore:["\"Knight set\""]},AttributeModifiers:[{AttributeName:"generic.armor",Amount:4,Operation:0,Slot:"chest"}],RepairCost:5}`,
  },
  {
    label: 'Enchanted sword',
    cmd: `/give @p diamond_sword{display:{Name:'{"text":"Excalibur","color":"gold"}'},Enchantments:[{id:"minecraft:sharpness",lvl:5},{id:"minecraft:unbreaking",lvl:3}],Unbreakable:1b}`,
  },
]

export default function CmdConvertPage() {
  const [input, setInput] = useState('')
  const [result, setResult] = useState<{ output: string; converted: string[]; skipped: string[] } | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  function run(cmd?: string) {
    const src = cmd ?? input
    setError(''); setResult(null); setCopied(false)
    if (!src.trim()) return
    try {
      const r = convertCommand(src)
      setResult(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function loadExample(cmd: string) {
    setInput(cmd); setResult(null); setError(''); setCopied(false)
    // run right after state updates
    setTimeout(() => {
      try {
        setResult(convertCommand(cmd))
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    }, 0)
  }

  function copy() {
    if (!result) return
    navigator.clipboard.writeText(result.output).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  return (
    <div className="section container">
      <div className="mb-8">
        <span className="badge-accent"><Repeat2 className="w-3.5 h-3.5" /> Commands</span>
        <h1 className="mt-4" style={{ color: 'rgb(var(--text))' }}>Command Version Converter</h1>
        <p className="mt-2 text-lg" style={{ color: 'rgb(var(--muted))' }}>
          Convert Minecraft commands from the old NBT tag syntax (pre-1.20.5) to the new component syntax (1.20.5+).
        </p>
      </div>

      <div className="grid lg:grid-cols-[260px_1fr] gap-6 items-start">
        {/* Examples */}
        <div className="card !p-3">
          <div className="text-xs font-semibold mb-2 px-1" style={{ color: 'rgb(var(--muted))' }}>EXAMPLES</div>
          <div className="space-y-1">
            {EXAMPLES.map(ex => (
              <button key={ex.label} onClick={() => loadExample(ex.cmd)}
                className="w-full text-left px-3 py-2 rounded-lg text-sm transition-all"
                style={{ background: input === ex.cmd ? 'rgb(var(--accent) / 0.1)' : 'transparent', color: input === ex.cmd ? 'rgb(var(--accent))' : 'rgb(var(--text))' }}>
                {ex.label}
              </button>
            ))}
          </div>
        </div>

        {/* Main */}
        <div className="space-y-4">
          {/* Input */}
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium" style={{ color: 'rgb(var(--muted))' }}>Pre-1.20.5 command (NBT tag syntax)</span>
            </div>
            <textarea
              className="w-full rounded-xl px-4 py-3 font-mono text-sm resize-none"
              rows={4}
              placeholder="/give @p diamond_sword{Enchantments:[{id:&quot;minecraft:sharpness&quot;,lvl:5}]}"
              value={input}
              onChange={e => { setInput(e.target.value); setResult(null); setError('') }}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run() } }}
              style={{ background: 'rgb(var(--bg))', border: '1px solid rgb(var(--border))', color: 'rgb(var(--text))' }}
            />
            <div className="flex items-center justify-between mt-3">
              <span className="text-xs" style={{ color: 'rgb(var(--muted))' }}>Ctrl+Enter to convert</span>
              <button onClick={() => run()} className="btn-primary px-5 py-2 text-sm flex items-center gap-2">
                <ArrowRight className="w-4 h-4" /> Convert to 1.20.5+
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-xl px-4 py-3 text-sm font-mono" style={{ background: 'rgb(var(--danger) / 0.1)', border: '1px solid rgb(var(--danger) / 0.3)', color: 'rgb(var(--danger))' }}>
              {error}
            </div>
          )}

          {/* Output */}
          {result && (
            <>
              <div className="card">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium" style={{ color: 'rgb(var(--muted))' }}>1.20.5+ command (component syntax)</span>
                  <button onClick={copy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all"
                    style={{ background: 'rgb(var(--accent) / 0.1)', color: 'rgb(var(--accent))' }}>
                    {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
                  </button>
                </div>
                <pre className="text-sm font-mono whitespace-pre-wrap break-all rounded-xl px-4 py-3"
                  style={{ background: 'rgb(var(--bg))', border: '1px solid rgb(var(--border))', color: 'rgb(var(--text))' }}>
                  {result.output}
                </pre>
              </div>

              {/* Conversion log */}
              <div className="grid sm:grid-cols-2 gap-3">
                {result.converted.length > 0 && (
                  <div className="card">
                    <div className="text-xs font-semibold mb-2" style={{ color: 'rgb(var(--success))' }}>CONVERTED</div>
                    <ul className="space-y-1">
                      {result.converted.map(s => (
                        <li key={s} className="text-xs font-mono flex items-center gap-1.5" style={{ color: 'rgb(var(--text))' }}>
                          <Check className="w-3 h-3 shrink-0" style={{ color: 'rgb(var(--success))' }} />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {result.skipped.length > 0 && (
                  <div className="card">
                    <div className="text-xs font-semibold mb-2" style={{ color: 'rgb(var(--warning))' }}>NOT CONVERTED</div>
                    <ul className="space-y-1">
                      {result.skipped.map(s => (
                        <li key={s} className="text-xs font-mono flex items-center gap-1.5" style={{ color: 'rgb(var(--muted))' }}>
                          <RefreshCw className="w-3 h-3 shrink-0" style={{ color: 'rgb(var(--warning))' }} />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Info */}
          <div className="rounded-xl px-4 py-3 text-xs space-y-1" style={{ background: 'rgb(var(--accent) / 0.05)', border: '1px solid rgb(var(--accent) / 0.15)', color: 'rgb(var(--muted))' }}>
            <div className="font-semibold" style={{ color: 'rgb(var(--text))' }}>What's supported</div>
            <div>Custom name & lore · Dye color · Enchantments · Stored enchantments · Unbreakable · Attribute modifiers · Repair cost · Damage · Custom model data · Player head profile · Potion contents · Container items (shulker/chest) · Map ID · Written book content</div>
          </div>
        </div>
      </div>
    </div>
  )
}
