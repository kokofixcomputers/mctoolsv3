import { ENCHANTMENTS } from './data'

export interface EnchantChoice {
  id: string
  level: number
}

export interface CombineStep {
  stepNum: number
  leftLabel: string
  leftEnchants: EnchantChoice[]
  leftIsItem: boolean
  rightLabel: string
  rightEnchants: EnchantChoice[]
  resultLabel: string
  resultEnchants: EnchantChoice[]
  xpCost: number
  tooCostly: boolean
}

interface NodeState {
  rc: number
  cost: number
}

export function toRoman(n: number): string {
  return (['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'])[n] ?? String(n)
}

function bookEnchantCostForMask(mask: number, enchants: EnchantChoice[]): number {
  // bit 0 = base item (no enchant contribution), bits 1..N = book[i-1]
  let total = 0
  for (let i = 1; i <= enchants.length; i++) {
    if (mask & (1 << i)) {
      const e = enchants[i - 1]
      const enc = ENCHANTMENTS[e.id]
      total += enc ? e.level * enc.bookMult : 0
    }
  }
  return total
}

function popcount(n: number) {
  let c = 0
  while (n) { c += n & 1; n >>>= 1 }
  return c
}

function enchantsForMask(mask: number, enchants: EnchantChoice[]): EnchantChoice[] {
  const out: EnchantChoice[] = []
  for (let i = 1; i <= enchants.length; i++) {
    if (mask & (1 << i)) out.push(enchants[i - 1])
  }
  return out
}

function nodeLabel(mask: number, enchants: EnchantChoice[], baseName: string): string {
  const hasBase = (mask & 1) !== 0
  const encs = enchantsForMask(mask, enchants)
  if (popcount(mask) === 1) {
    if (hasBase) return baseName
    const e = encs[0]
    return `${ENCHANTMENTS[e.id]?.name ?? e.id} ${toRoman(e.level)}`
  }
  if (hasBase) {
    if (encs.length === 0) return baseName
    if (encs.length === 1) return `${baseName} + ${ENCHANTMENTS[encs[0].id]?.name ?? encs[0].id} ${toRoman(encs[0].level)}`
    return `${baseName} (+${encs.length} enchants)`
  }
  if (encs.length <= 2) return encs.map(e => `${ENCHANTMENTS[e.id]?.name ?? e.id} ${toRoman(e.level)}`).join(' + ')
  return `Enchanted Book (${encs.length} enchants)`
}

interface ParentSplit {
  left: number
  right: number
}

function reconstructSteps(
  mask: number,
  dp: (NodeState | null)[],
  parent: (ParentSplit | null)[],
  enchants: EnchantChoice[],
  baseName: string,
  steps: CombineStep[],
) {
  if (popcount(mask) <= 1) return
  const split = parent[mask]
  if (!split) return
  reconstructSteps(split.left, dp, parent, enchants, baseName, steps)
  reconstructSteps(split.right, dp, parent, enchants, baseName, steps)

  const L = dp[split.left]!
  const R = dp[split.right]!
  const rightEnchants = enchantsForMask(split.right, enchants)
  const leftEnchants = enchantsForMask(split.left, enchants)
  const enchantCost = bookEnchantCostForMask(split.right, enchants)
  const xpCost = L.rc + R.rc + enchantCost
  const resultEnchants = [...leftEnchants, ...rightEnchants]
  const leftIsItem = (split.left & 1) !== 0

  steps.push({
    stepNum: 0,
    leftLabel: nodeLabel(split.left, enchants, baseName),
    leftEnchants,
    leftIsItem,
    rightLabel: nodeLabel(split.right, enchants, baseName),
    rightEnchants,
    resultLabel: (mask & 1) !== 0
      ? (resultEnchants.length === 0 ? baseName : nodeLabel(mask, enchants, baseName))
      : nodeLabel(mask, enchants, baseName),
    resultEnchants,
    xpCost,
    tooCostly: xpCost > 39,
  })
}

export function computeOptimalOrder(baseName: string, enchants: EnchantChoice[]): CombineStep[] {
  if (enchants.length === 0) return []

  // Nodes: index 0 = base item, indices 1..N = books
  const N = enchants.length
  const TOTAL = N + 1
  const FULL = (1 << TOTAL) - 1

  const dp: (NodeState | null)[] = new Array(1 << TOTAL).fill(null)
  const parent: (ParentSplit | null)[] = new Array(1 << TOTAL).fill(null)

  for (let i = 0; i < TOTAL; i++) dp[1 << i] = { rc: 0, cost: 0 }

  for (let mask = 3; mask <= FULL; mask++) {
    if (popcount(mask) < 2) continue
    let best: NodeState | null = null
    let bestSplit: ParentSplit | null = null

    // Enumerate all submasks of mask as s1 (left), s2 = mask ^ s1 (right)
    for (let s1 = (mask - 1) & mask; s1 > 0; s1 = (s1 - 1) & mask) {
      const s2 = mask ^ s1
      if (s2 === 0) break

      const A = dp[s1], B = dp[s2]
      if (!A || !B) continue

      // The base item (bit 0) must always be the LEFT operand when it's involved.
      // If neither side has the base item, try both orientations freely.
      const s1HasBase = (s1 & 1) !== 0
      const s2HasBase = (s2 & 1) !== 0
      const orientations: [NodeState, NodeState, number, number][] =
        s1HasBase ? [[A, B, s1, s2]] :
        s2HasBase ? [[B, A, s2, s1]] :
        [[A, B, s1, s2], [B, A, s2, s1]]

      for (const [L, R, ls, rs] of orientations) {
        const enchCost = bookEnchantCostForMask(rs, enchants)
        const stepCost = L.rc + R.rc + enchCost
        const total = L.cost + R.cost + stepCost
        const newRC = 2 * Math.max(L.rc, R.rc) + 1
        if (!best || total < best.cost) {
          best = { rc: newRC, cost: total }
          bestSplit = { left: ls, right: rs }
        }
      }
    }

    if (best) {
      dp[mask] = best
      parent[mask] = bestSplit
    }
  }

  const steps: CombineStep[] = []
  reconstructSteps(FULL, dp, parent, enchants, baseName, steps)
  steps.forEach((s, i) => { s.stepNum = i + 1 })
  return steps
}
