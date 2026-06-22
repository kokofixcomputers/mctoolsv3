import { useMemo, useState, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, X, Copy, Check, Package, FlaskConical, Rocket, Archive, Apple } from 'lucide-react'
import { ItemPicker, containerFilter } from '../components/ItemPicker'
import { RichNameEditor, RichLoreEditor, type RichLine, type RichLines } from '../components/RichTextEditor'
import { serializeNameSegs, serializeLoreSegs } from '../types/richText'
import {
  buildGiveCommand,
  buildPotionCommand,
  buildFireworkCommand,
  buildContainerCommand,
  type GiveAttributeModifier,
  type GiveEnchantment,
  type PotionEffect,
  type FireworkExplosion,
  type ContainerItem,
  type TextStyle,
  type EquippableSlot,
  type ItemRarity,
  type FoodEffect,
} from '../tools/give/giveCommand'
import { VERSIONS, GLOBAL_VERSION_FORMAT } from '../tools/give/versions'
import { useVersion } from '../contexts/VersionContext'

// ── constants ────────────────────────────────────────────────────────────────

const EFFECTS = [
  'speed','slowness','haste','mining_fatigue','strength','instant_health',
  'instant_damage','jump_boost','nausea','regeneration','resistance',
  'fire_resistance','water_breathing','invisibility','blindness','night_vision',
  'hunger','weakness','poison','wither','health_boost','absorption',
  'saturation','glowing','levitation','luck','unluck','slow_falling',
]

const ENCHANT_SUGGESTIONS = [
  'protection','fire_protection','feather_falling','blast_protection','projectile_protection',
  'respiration','aqua_affinity','thorns','depth_strider','frost_walker','binding_curse',
  'sharpness','smite','bane_of_arthropods','knockback','fire_aspect','looting','sweeping',
  'efficiency','silk_touch','unbreaking','fortune','power','punch','flame','infinity',
  'luck_of_the_sea','lure','mending','vanishing_curse','soul_speed','swift_sneak',
]

const ITEM_SUGGESTIONS = [
  'diamond_sword','diamond_pickaxe','diamond_axe','diamond_shovel','diamond_hoe',
  'diamond_helmet','diamond_chestplate','diamond_leggings','diamond_boots',
  'netherite_sword','netherite_pickaxe','netherite_axe','netherite_shovel','netherite_hoe',
  'netherite_helmet','netherite_chestplate','netherite_leggings','netherite_boots',
  'bow','crossbow','trident','shield','elytra','turtle_helmet','golden_apple','totem_of_undying',
]

const ATTRIBUTES = [
  { id: 'attack_damage', label: 'Attack Damage' },
  { id: 'attack_speed', label: 'Attack Speed' },
  { id: 'max_health', label: 'Max Health' },
  { id: 'movement_speed', label: 'Movement Speed' },
  { id: 'armor', label: 'Armor' },
  { id: 'armor_toughness', label: 'Armor Toughness' },
  { id: 'knockback_resistance', label: 'Knockback Resistance' },
  { id: 'luck', label: 'Luck' },
] as const

const OPS: GiveAttributeModifier['operation'][] = [
  'add_value','add_multiplied_base','add_multiplied_total',
]
const SLOTS: GiveAttributeModifier['slot'][] = [
  'mainhand','offhand','head','chest','legs','feet',
]

function strip(v: string) { return v.replace(/\s/g, '') }

// ── shared helpers ────────────────────────────────────────────────────────────

function CopyBtn({ text, disabled }: { text: string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false)
  const copy = useCallback(async () => {
    if (!text) return
    await navigator.clipboard.writeText(text)
    setCopied(true); setTimeout(() => setCopied(false), 900)
  }, [text])
  return (
    <button onClick={copy} disabled={disabled || !text} className="btn-secondary px-4 py-2 text-sm flex items-center gap-1.5">
      {copied ? <><Check className="w-3.5 h-3.5" />Copied</> : <><Copy className="w-3.5 h-3.5" />Copy</>}
    </button>
  )
}

function OutputCard({ command, error }: { command: string; error: string }) {
  return (
    <div className="card sticky top-20">
      <div className="flex items-center justify-between mb-4">
        <h3>Command</h3>
        <CopyBtn text={command} />
      </div>
      {error
        ? <div className="alert-danger text-sm">{error}</div>
        : <pre className="output-box text-xs whitespace-pre-wrap break-all min-h-16">{command || <span style={{ color: 'rgb(var(--muted))' }}>—</span>}</pre>}
    </div>
  )
}

function SectionCard({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}

function AddBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="btn-ghost flex items-center gap-1 text-xs">
      <Plus className="w-3.5 h-3.5" /> Add
    </button>
  )
}

function RemoveBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="btn-ghost p-1 text-red-400 hover:text-red-500">
      <X className="w-3.5 h-3.5" />
    </button>
  )
}

function StyleToggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="btn rounded-full px-3 py-1 text-xs transition-all"
      style={{
        border: `1px solid ${active ? 'rgb(var(--accent))' : 'rgb(var(--border))'}`,
        backgroundColor: active ? 'rgb(var(--accent) / 0.12)' : 'transparent',
        color: active ? 'rgb(var(--accent))' : 'rgb(var(--muted))',
      }}>
      {label}
    </button>
  )
}

// ── Item generator ────────────────────────────────────────────────────────────

const RARITIES: ItemRarity[] = ['common', 'uncommon', 'rare', 'epic']
const EQUIP_SLOTS: EquippableSlot[] = ['head', 'chest', 'legs', 'feet', 'mainhand', 'offhand']

function Toggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 text-sm select-none cursor-pointer"
      style={{ color: active ? 'rgb(var(--accent))' : 'rgb(var(--muted))' }}
    >
      <span
        className="w-8 h-4 rounded-full transition-colors relative"
        style={{ backgroundColor: active ? 'rgb(var(--accent))' : 'rgb(var(--border))' }}
      >
        <span
          className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all"
          style={{ left: active ? '18px' : '2px' }}
        />
      </span>
      {label}
    </button>
  )
}

function ItemGenerator() {
  const { version } = useVersion()
  const fmt = GLOBAL_VERSION_FORMAT[version.id] ?? 'modern-new'
  const isNew = fmt === 'modern-new'

  const [target, setTarget] = useState('@p')
  const [itemId, setItemId] = useState('diamond_chestplate')
  const [count, setCount] = useState(1)
  const [customNameSegs, setCustomNameSegs] = useState<RichLine>([])
  const [itemNameSegs, setItemNameSegs] = useState<RichLine>([])
  const [loreLines, setLoreLines] = useState<RichLines>([[]])
  const [rarity, setRarity] = useState<ItemRarity | ''>('')
  const [enchantments, setEnchantments] = useState<GiveEnchantment[]>([])
  const [attributes, setAttributes] = useState<GiveAttributeModifier[]>([])

  // Food / consumable
  const [enableFood, setEnableFood] = useState(false)
  const [nutrition, setNutrition] = useState(4)
  const [saturation, setSaturation] = useState(2)
  const [canAlwaysEat, setCanAlwaysEat] = useState(false)
  const [enableConsumable, setEnableConsumable] = useState(false)
  const [consumeSeconds, setConsumeSeconds] = useState(1.6)

  // Equippable (modern-new only)
  const [enableEquip, setEnableEquip] = useState(false)
  const [equipSlot, setEquipSlot] = useState<EquippableSlot>('head')
  const [damageOnHurt, setDamageOnHurt] = useState(true)

  // Toggles
  const [glider, setGlider] = useState(false)
  const [deathProtection, setDeathProtection] = useState(false)

  const { command, error } = useMemo(() => {
    const richFmt = (fmt === 'modern-new' || fmt === 'modern-old') ? fmt : null
    try {
      const parts: string[] = []

      // Build component list manually so we can inject rich text
      const c: string[] = []

      if (richFmt) {
        const cnSegs = customNameSegs.filter(s => s.text)
        if (cnSegs.length) c.push(`custom_name=${serializeNameSegs(cnSegs, richFmt, true)}`)

        const loreFiltered = loreLines.filter(l => l.some(s => s.text))
        if (loreFiltered.length) c.push(`lore=${serializeLoreSegs(loreFiltered, richFmt)}`)

        const inSegs = itemNameSegs.filter(s => s.text)
        if (inSegs.length) c.push(`item_name=${serializeNameSegs(inSegs, richFmt)}`)
      }

      return {
        command: buildGiveCommand({
          format: fmt,
          target, itemId, count,
          rarity: rarity || undefined,
          enchantments,
          attributes,
          nutrition: enableFood ? nutrition : undefined,
          saturation: enableFood ? saturation : undefined,
          canAlwaysEat: enableFood ? canAlwaysEat : undefined,
          consumeSeconds: enableConsumable ? consumeSeconds : undefined,
          equippableSlot: (isNew && enableEquip) ? equipSlot : undefined,
          damageOnHurt: (isNew && enableEquip) ? damageOnHurt : undefined,
          glider: isNew ? glider : undefined,
          deathProtection: isNew ? deathProtection : undefined,
          _extraComponents: c,  // injected pre-built components
        } as any),
        error: '',
      }
    } catch (e) { return { command: '', error: e instanceof Error ? e.message : 'Error' } }
  }, [fmt, target, itemId, count, customNameSegs, itemNameSegs, loreLines, rarity,
      enchantments, attributes, enableFood, nutrition, saturation, canAlwaysEat,
      enableConsumable, consumeSeconds, isNew, enableEquip, equipSlot, damageOnHurt,
      glider, deathProtection])

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">

        {/* Basics */}
        <SectionCard title="Item">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="form-label">Target</label>
              <input className="form-input" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="@p" />
              <div className="flex gap-1 mt-1.5">
                {['@p','@s','@a'].map((t) => (
                  <button key={t} onClick={() => setTarget(t)} className="btn-ghost rounded-lg px-2 py-0.5 text-xs">{t}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="form-label">Item ID</label>
              <ItemPicker value={itemId} onChange={setItemId} placeholder="diamond_sword" />
            </div>
            <div>
              <label className="form-label">Count</label>
              <input type="number" min={1} max={99} className="form-input" value={count}
                onChange={(e) => setCount(Math.max(1, parseInt(e.target.value) || 1))} />
            </div>
          </div>
        </SectionCard>

        {/* Display */}
        <SectionCard title="Display">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="form-label">Rarity</label>
              <select className="form-input" value={rarity} onChange={(e) => setRarity(e.target.value as ItemRarity | '')}>
                <option value="">— none —</option>
                {RARITIES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <RichNameEditor label="Item Name" hint="— item_name" value={itemNameSegs} onChange={setItemNameSegs} placeholder="Renamed Item" />
          <RichNameEditor label="Custom Name" hint="— custom_name (italic by default)" value={customNameSegs} onChange={setCustomNameSegs} placeholder="My Sword" defaultItalic />
          <RichLoreEditor value={loreLines} onChange={setLoreLines} />
        </SectionCard>

        {/* Enchantments */}
        <SectionCard title="Enchantments" action={<AddBtn onClick={() => setEnchantments((p) => [...p, { id: 'protection', level: 1 }])} />}>
          {enchantments.length === 0 && <p className="text-sm" style={{ color: 'rgb(var(--muted))' }}>No enchantments added.</p>}
          <div className="space-y-2">
            {enchantments.map((e, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input className="form-input font-mono text-sm flex-1" value={e.id}
                  onChange={(ev) => setEnchantments((p) => p.map((x, j) => j === i ? { ...x, id: strip(ev.target.value) } : x))}
                  list="ench-list" placeholder="protection" />
                <datalist id="ench-list">{ENCHANT_SUGGESTIONS.map((x) => <option key={x} value={x} />)}</datalist>
                <input type="number" min={1} max={255} className="form-input w-20 text-sm" value={e.level}
                  onChange={(ev) => setEnchantments((p) => p.map((x, j) => j === i ? { ...x, level: Number(ev.target.value) } : x))} />
                <RemoveBtn onClick={() => setEnchantments((p) => p.filter((_, j) => j !== i))} />
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Attributes */}
        <SectionCard title="Attribute Modifiers" action={<AddBtn onClick={() => setAttributes((p) => [...p, { attribute: 'armor', amount: 2, operation: 'add_value', slot: 'chest' }])} />}>
          {attributes.length === 0 && <p className="text-sm" style={{ color: 'rgb(var(--muted))' }}>No attribute modifiers added.</p>}
          <div className="space-y-3">
            {attributes.map((a, i) => (
              <div key={i} className="rounded-xl p-3 space-y-2" style={{ border: '1px solid rgb(var(--border))' }}>
                <div className="flex gap-2 items-center">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <div>
                      <label className="form-label text-xs">Attribute</label>
                      <select className="form-input text-sm" value={a.attribute}
                        onChange={(ev) => setAttributes((p) => p.map((x, j) => j === i ? { ...x, attribute: ev.target.value } : x))}>
                        {ATTRIBUTES.map((at) => <option key={at.id} value={at.id}>{at.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="form-label text-xs">Slot</label>
                      <select className="form-input text-sm" value={a.slot}
                        onChange={(ev) => setAttributes((p) => p.map((x, j) => j === i ? { ...x, slot: ev.target.value as GiveAttributeModifier['slot'] } : x))}>
                        {SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                  <RemoveBtn onClick={() => setAttributes((p) => p.filter((_, j) => j !== i))} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="form-label text-xs">Amount</label>
                    <input type="number" className="form-input text-sm" value={a.amount}
                      onChange={(ev) => setAttributes((p) => p.map((x, j) => j === i ? { ...x, amount: Number(ev.target.value) } : x))} />
                  </div>
                  <div>
                    <label className="form-label text-xs">Operation</label>
                    <select className="form-input text-sm" value={a.operation}
                      onChange={(ev) => setAttributes((p) => p.map((x, j) => j === i ? { ...x, operation: ev.target.value as GiveAttributeModifier['operation'] } : x))}>
                      {OPS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Food */}
        <SectionCard title="Food" action={<Toggle label="Enable" active={enableFood} onClick={() => setEnableFood((v) => !v)} />}>
          {!enableFood
            ? <p className="text-sm" style={{ color: 'rgb(var(--muted))' }}>Enable to add food properties.</p>
            : <>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="form-label">Nutrition</label>
                  <input type="number" min={0} className="form-input" value={nutrition} onChange={(e) => setNutrition(Number(e.target.value))} />
                </div>
                <div>
                  <label className="form-label">Saturation</label>
                  <input type="number" min={0} step={0.1} className="form-input" value={saturation} onChange={(e) => setSaturation(Number(e.target.value))} />
                </div>
                <div className="flex items-end pb-1">
                  <Toggle label="Can Always Eat" active={canAlwaysEat} onClick={() => setCanAlwaysEat((v) => !v)} />
                </div>
              </div>
              <div className="pt-1">
                <Toggle label={isNew ? 'Custom eat duration (consumable)' : 'Custom eat duration (eat_seconds)'} active={enableConsumable} onClick={() => setEnableConsumable((v) => !v)} />
                {enableConsumable && (
                  <div className="mt-2 flex items-center gap-3">
                    <input type="number" min={0} step={0.1} className="form-input w-32"
                      value={consumeSeconds} onChange={(e) => setConsumeSeconds(Number(e.target.value))} />
                    <span className="text-sm" style={{ color: 'rgb(var(--muted))' }}>seconds</span>
                  </div>
                )}
              </div>
            </>
          }
        </SectionCard>

        {/* Equippable / special (modern-new only) */}
        {isNew && (
          <SectionCard title="Special Properties">
            <div className="space-y-3">
              <Toggle label="Equippable" active={enableEquip} onClick={() => setEnableEquip((v) => !v)} />
              {enableEquip && (
                <div className="grid grid-cols-2 gap-4 pt-1">
                  <div>
                    <label className="form-label">Equipment Slot</label>
                    <select className="form-input" value={equipSlot} onChange={(e) => setEquipSlot(e.target.value as EquippableSlot)}>
                      {EQUIP_SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="flex items-end pb-1">
                    <Toggle label="Damage on hurt" active={damageOnHurt} onClick={() => setDamageOnHurt((v) => !v)} />
                  </div>
                </div>
              )}
              <Toggle label="Glider (like elytra)" active={glider} onClick={() => setGlider((v) => !v)} />
              <Toggle label="Death Protection (totem effect)" active={deathProtection} onClick={() => setDeathProtection((v) => !v)} />
            </div>
          </SectionCard>
        )}

      </div>

      <div><OutputCard command={command} error={error} /></div>
    </div>
  )
}

// ── Food generator ──────────────────────────────────────────────────────────────

const FOOD_PRESETS = [
  { label: 'Apple', n: 4, s: 2.4 },
  { label: 'Bread', n: 5, s: 6 },
  { label: 'Steak', n: 8, s: 12.8 },
  { label: 'Golden Apple', n: 4, s: 9.6 },
  { label: 'Cookie', n: 2, s: 0.4 },
]

function FoodGenerator() {
  const { version } = useVersion()
  const fmt = GLOBAL_VERSION_FORMAT[version.id] ?? 'modern-new'
  const isNew = fmt === 'modern-new'
  const richFmt = (fmt === 'modern-new' || fmt === 'modern-old') ? fmt : null

  const [target, setTarget] = useState('@p')
  const [itemId, setItemId] = useState('paper')
  const [count, setCount] = useState(1)
  const [customNameSegs, setCustomNameSegs] = useState<RichLine>([])
  const [itemNameSegs, setItemNameSegs] = useState<RichLine>([])
  const [loreLines, setLoreLines] = useState<RichLines>([[]])

  const [nutrition, setNutrition] = useState(4)
  const [saturation, setSaturation] = useState(2.4)
  const [canAlwaysEat, setCanAlwaysEat] = useState(false)
  const [customEat, setCustomEat] = useState(false)
  const [eatSeconds, setEatSeconds] = useState(1.6)
  const [effects, setEffects] = useState<FoodEffect[]>([])

  const { command, error } = useMemo(() => {
    try {
      const c: string[] = []
      if (richFmt) {
        const cnSegs = customNameSegs.filter(s => s.text)
        if (cnSegs.length) c.push(`custom_name=${serializeNameSegs(cnSegs, richFmt, true)}`)
        const loreFiltered = loreLines.filter(l => l.some(s => s.text))
        if (loreFiltered.length) c.push(`lore=${serializeLoreSegs(loreFiltered, richFmt)}`)
        const inSegs = itemNameSegs.filter(s => s.text)
        if (inSegs.length) c.push(`item_name=${serializeNameSegs(inSegs, richFmt)}`)
      }
      return {
        command: buildGiveCommand({
          format: fmt, target, itemId, count,
          nutrition, saturation,
          canAlwaysEat,
          consumeSeconds: customEat ? eatSeconds : undefined,
          foodEffects: effects.length ? effects : undefined,
          _extraComponents: c,
        } as never),
        error: '',
      }
    } catch (e) { return { command: '', error: e instanceof Error ? e.message : 'Error' } }
  }, [fmt, richFmt, target, itemId, count, customNameSegs, itemNameSegs, loreLines,
      nutrition, saturation, canAlwaysEat, customEat, eatSeconds, effects])

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">

        <SectionCard title="Edible Item">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="form-label">Target</label>
              <input className="form-input" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="@p" />
            </div>
            <div>
              <label className="form-label">Item ID</label>
              <ItemPicker value={itemId} onChange={setItemId} placeholder="paper" />
            </div>
            <div>
              <label className="form-label">Count</label>
              <input type="number" min={1} max={99} className="form-input" value={count}
                onChange={(e) => setCount(Math.max(1, parseInt(e.target.value) || 1))} />
            </div>
          </div>
          <p className="text-xs" style={{ color: 'rgb(var(--muted))' }}>
            Any item works — the food component makes it edible regardless of what it normally is.
          </p>
        </SectionCard>

        <SectionCard title="Food Properties">
          <div className="flex flex-wrap gap-1.5 mb-1">
            {FOOD_PRESETS.map((p) => (
              <button key={p.label} onClick={() => { setNutrition(p.n); setSaturation(p.s) }}
                className="btn-ghost rounded-lg px-2.5 py-1 text-xs"
                style={{ border: '1px solid rgb(var(--border))' }}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="form-label">Nutrition (½ hunger)</label>
              <input type="number" min={0} className="form-input" value={nutrition} onChange={(e) => setNutrition(Number(e.target.value))} />
            </div>
            <div>
              <label className="form-label">Saturation</label>
              <input type="number" min={0} step={0.1} className="form-input" value={saturation} onChange={(e) => setSaturation(Number(e.target.value))} />
            </div>
            <div className="flex items-end pb-1">
              <Toggle label="Can Always Eat" active={canAlwaysEat} onClick={() => setCanAlwaysEat((v) => !v)} />
            </div>
          </div>
          <div className="pt-1">
            <Toggle label={isNew ? 'Custom eat duration (consumable)' : 'Custom eat duration (eat_seconds)'} active={customEat} onClick={() => setCustomEat((v) => !v)} />
            {customEat && (
              <div className="mt-2 flex items-center gap-3">
                <input type="number" min={0} step={0.1} className="form-input w-32" value={eatSeconds} onChange={(e) => setEatSeconds(Number(e.target.value))} />
                <span className="text-sm" style={{ color: 'rgb(var(--muted))' }}>seconds (default 1.6)</span>
              </div>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Effects When Eaten" action={<AddBtn onClick={() => setEffects((p) => [...p, { id: 'regeneration', amplifier: 0, duration: 100, probability: 1 }])} />}>
          {effects.length === 0 && <p className="text-sm" style={{ color: 'rgb(var(--muted))' }}>No effects. Add one to apply a status effect on consumption.</p>}
          {effects.length > 0 && (
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 text-xs font-medium pb-1" style={{ color: 'rgb(var(--muted))' }}>
              <span>Effect</span><span className="w-16">Amplifier</span><span className="w-24">Duration (t)</span><span className="w-20">Chance</span><span></span>
            </div>
          )}
          <div className="space-y-2">
            {effects.map((ef, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center">
                <select className="form-input text-sm" value={ef.id}
                  onChange={(e) => setEffects((p) => p.map((x, j) => j === i ? { ...x, id: e.target.value } : x))}>
                  {EFFECTS.map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
                <input type="number" min={0} className="form-input text-sm w-16" value={ef.amplifier}
                  onChange={(e) => setEffects((p) => p.map((x, j) => j === i ? { ...x, amplifier: Number(e.target.value) } : x))} />
                <input type="number" min={1} className="form-input text-sm w-24" value={ef.duration}
                  onChange={(e) => setEffects((p) => p.map((x, j) => j === i ? { ...x, duration: Number(e.target.value) } : x))} />
                <input type="number" min={0} max={1} step={0.05} className="form-input text-sm w-20" value={ef.probability}
                  onChange={(e) => setEffects((p) => p.map((x, j) => j === i ? { ...x, probability: Number(e.target.value) } : x))} />
                <RemoveBtn onClick={() => setEffects((p) => p.filter((_, j) => j !== i))} />
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Display">
          <RichNameEditor label="Item Name" hint="— item_name" value={itemNameSegs} onChange={setItemNameSegs} placeholder="Mystery Snack" />
          <RichNameEditor label="Custom Name" hint="— custom_name (italic by default)" value={customNameSegs} onChange={setCustomNameSegs} placeholder="Tasty Paper" defaultItalic />
          <RichLoreEditor value={loreLines} onChange={setLoreLines} />
        </SectionCard>

      </div>
      <div><OutputCard command={command} error={error} /></div>
    </div>
  )
}

// ── Potion generator ──────────────────────────────────────────────────────────

function PotionGenerator() {
  const [target, setTarget] = useState('@p')
  const [count, setCount] = useState(1)
  const [effects, setEffects] = useState<PotionEffect[]>([{ id: 'speed', amplifier: 0, duration: 600 }])
  const [potionColor, setPotionColor] = useState('12079103')

  const { command, error } = useMemo(() => {
    try {
      return { command: buildPotionCommand({ target, count, effects, customColor: potionColor ? parseInt(potionColor) : undefined }), error: '' }
    } catch (e) { return { command: '', error: e instanceof Error ? e.message : 'Error' } }
  }, [target, count, effects, potionColor])

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <SectionCard title="Potion">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Target</label>
              <input className="form-input" value={target} onChange={(e) => setTarget(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Count</label>
              <input type="number" min={1} className="form-input" value={count} onChange={(e) => setCount(Number(e.target.value))} />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Effects" action={<AddBtn onClick={() => setEffects((p) => [...p, { id: 'speed', amplifier: 0, duration: 600 }])} />}>
          <div className="grid grid-cols-4 gap-2 text-xs font-medium pb-1" style={{ color: 'rgb(var(--muted))' }}>
            <span>Effect</span><span>Amplifier</span><span>Duration (ticks)</span><span></span>
          </div>
          {effects.map((e, i) => (
            <div key={i} className="grid grid-cols-4 gap-2 items-center">
              <select className="form-input text-sm" value={e.id}
                onChange={(ev) => setEffects((p) => p.map((x, j) => j === i ? { ...x, id: ev.target.value } : x))}>
                {EFFECTS.map((ef) => <option key={ef} value={ef}>{ef}</option>)}
              </select>
              <input type="number" min={0} className="form-input text-sm" value={e.amplifier}
                onChange={(ev) => setEffects((p) => p.map((x, j) => j === i ? { ...x, amplifier: Number(ev.target.value) } : x))} />
              <input type="number" min={1} className="form-input text-sm" value={e.duration}
                onChange={(ev) => setEffects((p) => p.map((x, j) => j === i ? { ...x, duration: Number(ev.target.value) } : x))} />
              <RemoveBtn onClick={() => setEffects((p) => p.filter((_, j) => j !== i))} />
            </div>
          ))}
        </SectionCard>

        <SectionCard title="Custom Color">
          <div className="flex gap-3 items-center">
            <input type="color"
              value={`#${parseInt(potionColor || '12079103').toString(16).padStart(6, '0')}`}
              onChange={(e) => setPotionColor(parseInt(e.target.value.slice(1), 16).toString())}
              className="h-10 w-14 rounded-lg cursor-pointer" style={{ border: '1px solid rgb(var(--border))' }} />
            <input className="form-input flex-1" value={potionColor} onChange={(e) => setPotionColor(e.target.value)} placeholder="12079103" />
          </div>
        </SectionCard>
      </div>
      <div><OutputCard command={command} error={error} /></div>
    </div>
  )
}

// ── Firework generator ────────────────────────────────────────────────────────

function FireworkGenerator() {
  const [target, setTarget] = useState('@p')
  const [count, setCount] = useState(1)
  const [flightDuration, setFlightDuration] = useState(1)
  const [explosions, setExplosions] = useState<FireworkExplosion[]>([
    { shape: 'small_ball', colors: ['#ff0000'], fadeColors: ['#ffffff'], trail: false, twinkle: false },
  ])

  const { command, error } = useMemo(() => {
    try {
      return { command: buildFireworkCommand({ target, count, flightDuration, explosions }), error: '' }
    } catch (e) { return { command: '', error: e instanceof Error ? e.message : 'Error' } }
  }, [target, count, flightDuration, explosions])

  function updateExp(i: number, patch: Partial<FireworkExplosion>) {
    setExplosions((p) => p.map((x, j) => j === i ? { ...x, ...patch } : x))
  }

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <SectionCard title="Firework Rocket">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="form-label">Target</label>
              <input className="form-input" value={target} onChange={(e) => setTarget(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Count</label>
              <input type="number" min={1} className="form-input" value={count} onChange={(e) => setCount(Number(e.target.value))} />
            </div>
            <div>
              <label className="form-label">Flight Duration</label>
              <input type="number" min={1} max={3} className="form-input" value={flightDuration} onChange={(e) => setFlightDuration(Number(e.target.value))} />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Explosions" action={<AddBtn onClick={() => setExplosions((p) => [...p, { shape: 'small_ball', colors: ['#ff0000'], fadeColors: ['#ffffff'], trail: false, twinkle: false }])} />}>
          <div className="space-y-4">
            {explosions.map((exp, i) => (
              <div key={i} className="rounded-xl p-4 space-y-4" style={{ border: '1px solid rgb(var(--border))' }}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Explosion {i + 1}</span>
                  <RemoveBtn onClick={() => setExplosions((p) => p.filter((_, j) => j !== i))} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">Shape</label>
                    <select className="form-input text-sm" value={exp.shape}
                      onChange={(e) => updateExp(i, { shape: e.target.value as FireworkExplosion['shape'] })}>
                      <option value="small_ball">Small Ball</option>
                      <option value="large_ball">Large Ball</option>
                      <option value="star">Star</option>
                      <option value="creeper">Creeper</option>
                      <option value="burst">Burst</option>
                    </select>
                  </div>
                  <div className="flex items-end gap-4">
                    <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'rgb(var(--muted))' }}>
                      <input type="checkbox" checked={exp.trail} onChange={(e) => updateExp(i, { trail: e.target.checked })} className="accent-violet-600" />
                      Trail
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'rgb(var(--muted))' }}>
                      <input type="checkbox" checked={exp.twinkle} onChange={(e) => updateExp(i, { twinkle: e.target.checked })} className="accent-violet-600" />
                      Twinkle
                    </label>
                  </div>
                </div>
                <div>
                  <label className="form-label">Colors</label>
                  <div className="flex flex-col gap-2">
                    {exp.colors.map((c, ci) => (
                      <div key={ci} className="flex items-center gap-2">
                        <input type="color" value={c}
                          onChange={(e) => { const nc = [...exp.colors]; nc[ci] = e.target.value; updateExp(i, { colors: nc }) }}
                          className="h-8 w-8 rounded-md cursor-pointer shrink-0" style={{ border: '1px solid rgb(var(--border))' }} />
                        <span className="font-mono text-sm" style={{ color: 'rgb(var(--muted))' }}>{c}</span>
                        <button onClick={() => updateExp(i, { colors: exp.colors.filter((_, j) => j !== ci) })}
                          className="ml-auto btn-ghost rounded-md p-1 text-xs" style={{ color: 'rgb(var(--muted))' }}>
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    <button onClick={() => updateExp(i, { colors: [...exp.colors, '#ff0000'] })}
                      className="btn-ghost rounded-lg px-3 py-1.5 text-xs flex items-center gap-1.5 w-fit">
                      <Plus className="w-3 h-3" /> Add color
                    </button>
                  </div>
                </div>
                <div>
                  <label className="form-label">Fade Colors</label>
                  <div className="flex flex-col gap-2">
                    {exp.fadeColors.map((c, ci) => (
                      <div key={ci} className="flex items-center gap-2">
                        <input type="color" value={c}
                          onChange={(e) => { const nc = [...exp.fadeColors]; nc[ci] = e.target.value; updateExp(i, { fadeColors: nc }) }}
                          className="h-8 w-8 rounded-md cursor-pointer shrink-0" style={{ border: '1px solid rgb(var(--border))' }} />
                        <span className="font-mono text-sm" style={{ color: 'rgb(var(--muted))' }}>{c}</span>
                        <button onClick={() => updateExp(i, { fadeColors: exp.fadeColors.filter((_, j) => j !== ci) })}
                          className="ml-auto btn-ghost rounded-md p-1 text-xs" style={{ color: 'rgb(var(--muted))' }}>
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    <button onClick={() => updateExp(i, { fadeColors: [...exp.fadeColors, '#ffffff'] })}
                      className="btn-ghost rounded-lg px-3 py-1.5 text-xs flex items-center gap-1.5 w-fit">
                      <Plus className="w-3 h-3" /> Add fade color
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
      <div><OutputCard command={command} error={error} /></div>
    </div>
  )
}

// ── Container generator ───────────────────────────────────────────────────────

function ContainerGenerator() {
  const [target, setTarget] = useState('@p')
  const [count, setCount] = useState(1)
  const [containerType, setContainerType] = useState('chest')
  const [items, setItems] = useState<ContainerItem[]>([{ slot: 0, itemId: 'diamond_pickaxe', count: 1 }])

  const { command, error } = useMemo(() => {
    try {
      return { command: buildContainerCommand({ target, count, containerType, items }), error: '' }
    } catch (e) { return { command: '', error: e instanceof Error ? e.message : 'Error' } }
  }, [target, count, containerType, items])

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <SectionCard title="Container">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="form-label">Target</label>
              <input className="form-input" value={target} onChange={(e) => setTarget(e.target.value)} />
            </div>
            <div>
              <label className="form-label">Count</label>
              <input type="number" min={1} className="form-input" value={count} onChange={(e) => setCount(Number(e.target.value))} />
            </div>
            <div>
              <label className="form-label">Container Type</label>
              <ItemPicker value={containerType} onChange={setContainerType} filter={containerFilter} placeholder="chest" />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Items" action={<AddBtn onClick={() => setItems((p) => [...p, { slot: p.length, itemId: 'diamond', count: 1 }])} />}>
          <div className="grid grid-cols-4 gap-2 text-xs font-medium pb-1" style={{ color: 'rgb(var(--muted))' }}>
            <span>Slot</span><span className="col-span-2">Item ID</span><span>Count</span>
          </div>
          <div className="space-y-2">
            {items.map((item, i) => (
              <div key={i} className="grid grid-cols-4 gap-2 items-center">
                <input type="number" min={0} max={53} className="form-input text-sm" value={item.slot}
                  onChange={(e) => setItems((p) => p.map((x, j) => j === i ? { ...x, slot: Number(e.target.value) } : x))} />
                <ItemPicker className="col-span-2" value={item.itemId}
                  onChange={(v) => setItems((p) => p.map((x, j) => j === i ? { ...x, itemId: v } : x))}
                  placeholder="diamond_pickaxe" />
                <div className="flex gap-1 items-center">
                  <input type="number" min={1} max={64} className="form-input text-sm flex-1" value={item.count}
                    onChange={(e) => setItems((p) => p.map((x, j) => j === i ? { ...x, count: Number(e.target.value) } : x))} />
                  <RemoveBtn onClick={() => setItems((p) => p.filter((_, j) => j !== i))} />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
      <div><OutputCard command={command} error={error} /></div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = 'item' | 'food' | 'potion' | 'firework' | 'container'

const TABS: { id: Tab; label: string; Icon: typeof Package }[] = [
  { id: 'item',      label: 'Item',      Icon: Package },
  { id: 'food',      label: 'Food',      Icon: Apple },
  { id: 'potion',    label: 'Potion',    Icon: FlaskConical },
  { id: 'firework',  label: 'Firework',  Icon: Rocket },
  { id: 'container', label: 'Container', Icon: Archive },
]

export default function GivePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>((searchParams.get('tab') as Tab) || 'item')

  useEffect(() => {
    const t = searchParams.get('tab') as Tab
    if (t && TABS.find((x) => x.id === t)) setTab(t)
  }, [searchParams])

  function handleSetTab(t: Tab) {
    setTab(t)
    setSearchParams(t === 'item' ? {} : { tab: t }, { replace: true })
  }

  return (
    <div className="section container">
      <div className="mb-8">
        <span className="badge-muted">Tool</span>
        <h1 className="mt-4" style={{ color: 'rgb(var(--text))' }}>/give Generator</h1>
        <p className="mt-2 text-lg" style={{ color: 'rgb(var(--muted))' }}>
          Build give commands for items, potions, fireworks, and containers.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-xl w-fit mb-8" style={{ backgroundColor: 'rgb(var(--border) / 0.4)' }}>
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => handleSetTab(id)}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === id ? 'shadow-sm' : ''
            }`}
            style={{
              backgroundColor: tab === id ? 'rgb(var(--panel))' : 'transparent',
              color: tab === id ? 'rgb(var(--text))' : 'rgb(var(--muted))',
              boxShadow: tab === id ? '0 1px 4px rgba(0,0,0,.1)' : undefined,
            }}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'item'      && <ItemGenerator />}
      {tab === 'food'      && <FoodGenerator />}
      {tab === 'potion'    && <PotionGenerator />}
      {tab === 'firework'  && <FireworkGenerator />}
      {tab === 'container' && <ContainerGenerator />}
    </div>
  )
}
