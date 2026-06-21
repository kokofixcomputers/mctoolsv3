export const TAG = {
  END: 0, BYTE: 1, SHORT: 2, INT: 3, LONG: 4, FLOAT: 5, DOUBLE: 6,
  BYTE_ARRAY: 7, STRING: 8, LIST: 9, COMPOUND: 10, INT_ARRAY: 11, LONG_ARRAY: 12,
} as const

export type TagId = typeof TAG[keyof typeof TAG]

export type NbtNode =
  | { t: 1; v: number }
  | { t: 2; v: number }
  | { t: 3; v: number }
  | { t: 4; v: bigint }
  | { t: 5; v: number }
  | { t: 6; v: number }
  | { t: 7; v: number[] }
  | { t: 8; v: string }
  | { t: 9; et: TagId; v: NbtNode[] }
  | { t: 10; v: [string, NbtNode][] }
  | { t: 11; v: number[] }
  | { t: 12; v: bigint[] }

export interface NbtDocument {
  name: string
  root: Extract<NbtNode, { t: 10 }>
}

export const TAG_NAMES: Record<number, string> = {
  1: 'Byte', 2: 'Short', 3: 'Int', 4: 'Long', 5: 'Float', 6: 'Double',
  7: 'Byte[]', 8: 'String', 9: 'List', 10: 'Compound', 11: 'Int[]', 12: 'Long[]',
}

export const TAG_LABELS: Record<number, string> = {
  1: 'B', 2: 'S', 3: 'I', 4: 'L', 5: 'F', 6: 'D',
  7: 'B[]', 8: '""', 9: '[ ]', 10: '{ }', 11: 'I[]', 12: 'L[]',
}

export const TAG_COLORS: Record<number, string> = {
  1: '#f59e0b', 2: '#f59e0b', 3: '#f59e0b', 4: '#f59e0b',
  5: '#3b82f6', 6: '#3b82f6',
  7: '#a855f7', 11: '#a855f7', 12: '#a855f7',
  8: '#22c55e',
  9: '#06b6d4',
  10: '#f97316',
}

export function defaultNode(t: TagId): NbtNode {
  switch (t) {
    case 1: return { t: 1, v: 0 }
    case 2: return { t: 2, v: 0 }
    case 3: return { t: 3, v: 0 }
    case 4: return { t: 4, v: 0n }
    case 5: return { t: 5, v: 0 }
    case 6: return { t: 6, v: 0 }
    case 7: return { t: 7, v: [] }
    case 8: return { t: 8, v: '' }
    case 9: return { t: 9, et: 1, v: [] }
    case 10: return { t: 10, v: [] }
    case 11: return { t: 11, v: [] }
    case 12: return { t: 12, v: [] }
    default: return { t: 8, v: '' }
  }
}
