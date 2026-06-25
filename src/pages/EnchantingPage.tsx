import { useState, useMemo } from 'react'
import { BookOpen, Sparkles, AlertTriangle, Plus, ArrowRight } from 'lucide-react'
import { ITEMS, ENCHANTMENTS, ITEM, ASSET_BASE, type ItemDef } from '../tools/enchanting/data'
import { computeOptimalOrder, toRoman, type EnchantChoice } from '../tools/enchanting/optimizer'

const BOOK_ICON = `${ASSET_BASE}/items/enchanted_book.png`

function ItemIcon({ id, size = 32 }: { id: string; size?: number }) {
  return (
    <img
      src={ITEM(id)} alt={id} width={size} height={size}
      style={{ imageRendering: 'pixelated', flexShrink: 0 }}
      onError={e => { (e.target as HTMLImageElement).style.opacity = '0.3' }}
    />
  )
}

function BookIcon({ size = 28 }: { size?: number }) {
  return (
    <img
      src={BOOK_ICON} alt="Enchanted Book" width={size} height={size}
      style={{ imageRendering: 'pixelated', flexShrink: 0 }}
    />
  )
}

export default function EnchantingPage() {
  const [selectedItem, setSelectedItem] = useState<ItemDef>(ITEMS[0])
  const [chosen, setChosen] = useState<Record<string, number>>({})

  function selectItem(item: ItemDef) {
    setSelectedItem(item)
    setChosen({})
  }

  function toggleEnchant(id: string) {
    setChosen(prev => {
      if (prev[id] !== undefined) {
        const next = { ...prev }
        delete next[id]
        return next
      }
      return { ...prev, [id]: ENCHANTMENTS[id].maxLevel }
    })
  }

  function setLevel(id: string, level: number) {
    setChosen(prev => ({ ...prev, [id]: level }))
  }

  const incompatible = useMemo(() => {
    const blocked = new Set<string>()
    for (const id of Object.keys(chosen)) {
      ENCHANTMENTS[id]?.incompatibleWith?.forEach(x => blocked.add(x))
    }
    return blocked
  }, [chosen])

  const steps = useMemo(() => {
    const enchants: EnchantChoice[] = Object.entries(chosen).map(([id, level]) => ({ id, level }))
    return computeOptimalOrder(selectedItem.name, enchants)
  }, [chosen, selectedItem])

  const totalXP = steps.reduce((s, step) => s + step.xpCost, 0)
  const hasTooCostly = steps.some(s => s.tooCostly)
  const selectedCount = Object.keys(chosen).length

  return (
    <div className="section container">
      <div className="mb-8">
        <span className="badge-accent"><BookOpen className="w-3.5 h-3.5" /> Calculator</span>
        <h1 className="mt-4" style={{ color: 'rgb(var(--text))' }}>Enchantment Calculator</h1>
        <p className="mt-2 text-lg" style={{ color: 'rgb(var(--muted))' }}>
          Pick an item and enchantments — get the optimal anvil combining order and total XP cost.
        </p>
      </div>

      <div className="grid lg:grid-cols-[260px_1fr] gap-6 items-start">
        {/* Item picker */}
        <div className="card !p-3">
          <p className="text-xs font-semibold mb-2 px-1 uppercase tracking-wider"
            style={{ color: 'rgb(var(--muted))' }}>Item</p>
          <div className="space-y-0.5">
            {ITEMS.map(item => {
              const active = item.id === selectedItem.id
              return (
                <button key={item.id} onClick={() => selectItem(item)}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all"
                  style={{
                    background: active ? 'rgb(var(--accent) / 0.1)' : 'transparent',
                    border: `1px solid ${active ? 'rgb(var(--accent))' : 'transparent'}`,
                  }}>
                  <ItemIcon id={item.icon} size={26} />
                  <span className="text-sm font-medium"
                    style={{ color: active ? 'rgb(var(--accent))' : 'rgb(var(--text))' }}>
                    {item.name}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Right panel */}
        <div className="space-y-5">
          {/* Enchantment picker */}
          <div className="card">
            <div className="flex items-center gap-3 mb-5">
              <ItemIcon id={selectedItem.icon} size={44} />
              <div>
                <h2 className="text-xl font-bold" style={{ color: 'rgb(var(--text))' }}>
                  {selectedItem.name}
                </h2>
                <p className="text-sm" style={{ color: 'rgb(var(--muted))' }}>
                  {selectedItem.enchants.length} enchantments available
                  {selectedCount > 0 && ` · ${selectedCount} selected`}
                </p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-2">
              {selectedItem.enchants.map(id => {
                const enc = ENCHANTMENTS[id]
                if (!enc) return null
                const isChosen = chosen[id] !== undefined
                const isBlocked = !isChosen && incompatible.has(id)
                const level = chosen[id] ?? enc.maxLevel

                return (
                  <div key={id}
                    className={`rounded-xl p-3 transition-all ${isBlocked ? 'opacity-40 pointer-events-none' : ''}`}
                    style={{
                      border: `1px solid ${isChosen ? 'rgb(var(--accent))' : 'rgb(var(--border))'}`,
                      background: isChosen ? 'rgb(var(--accent) / 0.06)' : 'transparent',
                    }}>
                    {/* Top row: book icon + name + checkbox */}
                    <div className="flex items-start gap-2">
                      <button onClick={() => toggleEnchant(id)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                        <BookIcon size={22} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold leading-tight"
                            style={{ color: enc.curse ? 'rgb(var(--warning))' : isChosen ? 'rgb(var(--accent))' : 'rgb(var(--text))' }}>
                            {enc.name}
                            {enc.curse && ' ✦'}
                          </div>
                          <div className="text-xs mt-0.5 leading-tight" style={{ color: 'rgb(var(--muted))' }}>
                            {enc.desc}
                          </div>
                        </div>
                      </button>

                      {/* Checkbox */}
                      <button onClick={() => toggleEnchant(id)}
                        className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 transition-all"
                        style={{
                          background: isChosen ? 'rgb(var(--accent))' : 'transparent',
                          border: `2px solid ${isChosen ? 'rgb(var(--accent))' : 'rgb(var(--border))'}`,
                        }}>
                        {isChosen && (
                          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                            <path d="M1 3.5L3.2 5.5L8 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>
                    </div>

                    {/* Level selector (only when chosen and maxLevel > 1) */}
                    {isChosen && enc.maxLevel > 1 && (
                      <div className="flex gap-1 mt-2 ml-6">
                        {Array.from({ length: enc.maxLevel }, (_, i) => i + 1).map(l => (
                          <button key={l} onClick={() => setLevel(id, l)}
                            className="w-7 h-6 rounded text-xs font-bold transition-all"
                            style={{
                              background: level === l ? 'rgb(var(--accent))' : 'rgb(var(--accent) / 0.12)',
                              color: level === l ? 'rgb(var(--accent-fg))' : 'rgb(var(--accent))',
                            }}>
                            {toRoman(l)}
                          </button>
                        ))}
                      </div>
                    )}

                    {isBlocked && (
                      <p className="text-xs mt-1 ml-6" style={{ color: 'rgb(var(--muted))' }}>
                        Incompatible with selection
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Combining guide */}
          {steps.length > 0 ? (
            <div className="card">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h3 className="font-bold text-base" style={{ color: 'rgb(var(--text))' }}>
                  Optimal Combining Order
                </h3>
                <div className="flex items-center gap-2">
                  {hasTooCostly && (
                    <span className="badge-warning flex items-center gap-1 text-xs">
                      <AlertTriangle className="w-3 h-3" /> Too Expensive
                    </span>
                  )}
                  <span className="badge-accent font-bold">{totalXP} levels total</span>
                </div>
              </div>

              <ol className="space-y-2.5">
                {steps.map((step, i) => (
                  <li key={i}
                    className="rounded-xl px-3 py-2.5"
                    style={{
                      border: `1px solid ${step.tooCostly ? 'rgb(var(--warning) / 0.35)' : 'rgb(var(--border))'}`,
                      background: step.tooCostly ? 'rgb(var(--warning) / 0.05)' : 'rgb(var(--bg))',
                    }}>
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Step number */}
                      <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                        style={{ background: 'rgb(var(--accent) / 0.15)', color: 'rgb(var(--accent))' }}>
                        {step.stepNum}
                      </span>

                      {/* Left */}
                      <div className="flex items-center gap-1.5">
                        {step.leftIsItem
                          ? <ItemIcon id={selectedItem.icon} size={26} />
                          : <BookIcon size={26} />}
                        <span className="text-sm font-medium" style={{ color: 'rgb(var(--text))' }}>
                          {step.leftLabel}
                        </span>
                      </div>

                      <Plus className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'rgb(var(--muted))' }} />

                      {/* Right (always a book or combined book) */}
                      <div className="flex items-center gap-1.5">
                        <BookIcon size={26} />
                        <span className="text-sm font-medium" style={{ color: 'rgb(var(--text))' }}>
                          {step.rightLabel}
                        </span>
                      </div>

                      <ArrowRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'rgb(var(--muted))' }} />

                      {/* Result */}
                      <div className="flex items-center gap-1.5">
                        {step.leftIsItem
                          ? <ItemIcon id={selectedItem.icon} size={26} />
                          : <BookIcon size={26} />}
                        <span className="text-sm" style={{ color: 'rgb(var(--muted))' }}>
                          {step.resultLabel}
                        </span>
                      </div>

                      {/* XP badge */}
                      <span className="ml-auto text-sm font-bold flex-shrink-0 px-2 py-0.5 rounded-lg"
                        style={{
                          background: step.tooCostly ? 'rgb(var(--warning) / 0.15)' : 'rgb(var(--accent) / 0.12)',
                          color: step.tooCostly ? 'rgb(var(--warning))' : 'rgb(var(--accent))',
                        }}>
                        {step.tooCostly && '⚠ '}{step.xpCost} lvl
                      </span>
                    </div>
                  </li>
                ))}
              </ol>

              {/* Total */}
              <div className="flex items-center justify-between mt-4 pt-4"
                style={{ borderTop: '1px solid rgb(var(--border))' }}>
                <span className="text-sm" style={{ color: 'rgb(var(--muted))' }}>Total XP cost</span>
                <span className="text-xl font-bold" style={{ color: 'rgb(var(--accent))' }}>
                  {totalXP} levels
                </span>
              </div>

              {hasTooCostly && (
                <div className="mt-3 rounded-xl p-3 text-sm flex items-start gap-2"
                  style={{ background: 'rgb(var(--warning) / 0.07)', border: '1px solid rgb(var(--warning) / 0.25)', color: 'rgb(var(--muted))' }}>
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'rgb(var(--warning))' }} />
                  A step costs over 39 levels — vanilla's anvil limit. Level up more, or split enchants across multiple sessions.
                </div>
              )}
            </div>
          ) : (
            <div className="card text-center py-12" style={{ color: 'rgb(var(--muted))' }}>
              <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-25" />
              <p className="font-semibold" style={{ color: 'rgb(var(--text))' }}>No enchantments selected</p>
              <p className="text-sm mt-1">Toggle enchantments above and the optimal combining order will appear here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
