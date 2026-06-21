import { useState } from 'react'
import { ArrowLeftRight, Copy, Check } from 'lucide-react'

const OFFSET = 4294967296n // 2^32

type Direction = 'bedrock-to-java' | 'java-to-bedrock'

function parseSeed(raw: string): bigint | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    return BigInt(trimmed)
  } catch {
    return null
  }
}

function convert(seed: bigint, direction: Direction): { result: bigint; note: string } {
  if (direction === 'bedrock-to-java') {
    if (seed >= 0n) {
      return { result: seed, note: 'Positive seed — works the same in Java. No conversion needed.' }
    }
    return { result: seed + OFFSET, note: 'Negative Bedrock seed converted to Java by adding 4,294,967,296.' }
  } else {
    // java-to-bedrock: reverse — if java seed >= 2^31, it came from a negative bedrock seed
    const INT32_MAX = 2147483647n
    if (seed >= 0n && seed <= INT32_MAX) {
      return { result: seed, note: 'Positive seed — works the same in Bedrock. No conversion needed.' }
    }
    if (seed > INT32_MAX) {
      return { result: seed - OFFSET, note: 'Java seed converted to Bedrock by subtracting 4,294,967,296.' }
    }
    return { result: seed, note: 'Negative seed — works the same in Bedrock. No conversion needed.' }
  }
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200) }}
      className="btn-ghost p-1.5 flex items-center gap-1 text-xs"
    >
      {copied ? <><Check className="w-3.5 h-3.5" />Copied</> : <><Copy className="w-3.5 h-3.5" />Copy</>}
    </button>
  )
}

export default function SeedConverterPage() {
  const [input, setInput] = useState('')
  const [direction, setDirection] = useState<Direction>('bedrock-to-java')

  const seed = parseSeed(input)
  const conversion = seed !== null ? convert(seed, direction) : null

  const fromLabel = direction === 'bedrock-to-java' ? 'Bedrock' : 'Java'
  const toLabel   = direction === 'bedrock-to-java' ? 'Java'    : 'Bedrock'

  return (
    <div className="section container">
      <div className="mb-10">
        <span className="badge-muted">Tool</span>
        <h1 className="mt-4" style={{ color: 'rgb(var(--text))' }}>Seed Converter</h1>
        <p className="mt-2 text-lg" style={{ color: 'rgb(var(--muted))' }}>
          Convert Minecraft world seeds between Java and Bedrock editions.
        </p>
      </div>

      <div className="max-w-lg space-y-6">
        {/* Direction toggle */}
        <div className="card">
          <label className="form-label">Conversion Direction</label>
          <div className="flex gap-2">
            {(['bedrock-to-java', 'java-to-bedrock'] as const).map(d => (
              <button
                key={d}
                onClick={() => setDirection(d)}
                className="flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-all"
                style={{
                  border: `1px solid ${direction === d ? 'rgb(var(--accent))' : 'rgb(var(--border))'}`,
                  backgroundColor: direction === d ? 'rgb(var(--accent) / 0.1)' : 'transparent',
                  color: direction === d ? 'rgb(var(--accent))' : 'rgb(var(--muted))',
                }}
              >
                {d === 'bedrock-to-java' ? 'Bedrock → Java' : 'Java → Bedrock'}
              </button>
            ))}
          </div>
        </div>

        {/* Input */}
        <div className="card space-y-4">
          <div>
            <label className="form-label">{fromLabel} Seed</label>
            <input
              className="form-input font-mono text-lg"
              placeholder="e.g. -1234567890"
              value={input}
              onChange={e => setInput(e.target.value)}
              autoFocus
            />
          </div>

          {/* Result */}
          {input.trim() && (
            seed === null ? (
              <div className="rounded-xl p-4 text-sm" style={{ backgroundColor: 'rgb(var(--border) / 0.3)', color: 'rgb(var(--muted))' }}>
                Enter a valid integer seed.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <ArrowLeftRight className="w-4 h-4 shrink-0" style={{ color: 'rgb(var(--accent))' }} />
                  <div className="flex-1">
                    <div className="text-xs mb-1" style={{ color: 'rgb(var(--muted))' }}>{toLabel} Seed</div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xl font-semibold" style={{ color: 'rgb(var(--text))' }}>
                        {conversion!.result.toString()}
                      </span>
                      <CopyBtn text={conversion!.result.toString()} />
                    </div>
                  </div>
                </div>
                <div
                  className="rounded-xl px-4 py-3 text-sm"
                  style={{
                    backgroundColor: 'rgb(var(--accent) / 0.08)',
                    border: '1px solid rgb(var(--accent) / 0.2)',
                    color: 'rgb(var(--muted))',
                  }}
                >
                  {conversion!.note}
                </div>
              </div>
            )
          )}
        </div>

        {/* Info */}
        <div className="card text-sm space-y-2" style={{ color: 'rgb(var(--muted))' }}>
          <p className="font-semibold" style={{ color: 'rgb(var(--text))' }}>How it works</p>
          <p><span style={{ color: 'rgb(var(--accent))' }}>Positive seeds</span> — identical in both editions. No conversion needed.</p>
          <p><span style={{ color: 'rgb(var(--accent))' }}>Negative Bedrock seeds</span> — add 4,294,967,296 to get the Java equivalent.</p>
          <p><span style={{ color: 'rgb(var(--accent))' }}>Large Java seeds</span> — subtract 4,294,967,296 to get the Bedrock equivalent.</p>
        </div>
      </div>
    </div>
  )
}
