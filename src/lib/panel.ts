/**
 * Talks to the StratPanel page that embeds this app in an iframe.
 *
 * The panel serves this app from its own address, so messages are only ever exchanged with the same origin. Without
 * ?embed=1 nothing here does anything and the app behaves like the standalone site.
 *
 * panel -> app   { source: 'stratpanel', type: 'state', version, running, canRun, server, software, players }
 * app -> panel   { source: 'mctools', type: 'ready' }
 * app -> panel   { source: 'mctools', type: 'run', id, commands: string[] }
 * panel -> app   { source: 'stratpanel', type: 'run-result', id, ok, error? }
 */
import { useSyncExternalStore } from 'react'

export interface PanelState {
  /** True once the panel answered; false for the standalone site and while waiting. */
  connected: boolean
  /** The Minecraft version of the server as the panel knows it, like "1.21.4" or "26.3". */
  version?: string
  software?: string
  server?: string
  /** The server is online. */
  running: boolean
  /** The signed in user may send console commands. */
  canRun: boolean
  players: string[]
}

export const embedded: boolean =
  typeof window !== 'undefined' && window.parent !== window && new URLSearchParams(window.location.search).has('embed')

let state: PanelState = { connected: false, running: false, canRun: false, players: [] }
const listeners = new Set<() => void>()
const pending = new Map<string, { resolve: () => void; reject: (e: Error) => void; timer: number }>()

function set(next: Partial<PanelState>) {
  state = { ...state, ...next }
  listeners.forEach((l) => l())
}

function post(message: Record<string, unknown>) {
  window.parent.postMessage({ source: 'mctools', ...message }, window.location.origin)
}

if (embedded) {
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin || event.source !== window.parent) return
    const data = event.data
    if (!data || data.source !== 'stratpanel') return

    if (data.type === 'state') {
      set({
        connected: true,
        version: typeof data.version === 'string' ? data.version : undefined,
        software: typeof data.software === 'string' ? data.software : undefined,
        server: typeof data.server === 'string' ? data.server : undefined,
        running: !!data.running,
        canRun: !!data.canRun,
        players: Array.isArray(data.players) ? data.players.map(String) : [],
      })
    } else if (data.type === 'run-result') {
      const waiting = pending.get(data.id)
      if (!waiting) return
      pending.delete(data.id)
      window.clearTimeout(waiting.timer)
      if (data.ok) waiting.resolve()
      else waiting.reject(new Error(data.error || 'The panel could not run the command'))
    }
  })
  post({ type: 'ready' })
}

export function usePanel(): PanelState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
  )
}

/** Splits generated output into console commands: one per line, no leading slash, comments and blanks dropped. */
export function toCommands(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^\//, ''))
    .filter((line) => line && !line.startsWith('#'))
}

/** Sends commands to the server console through the panel. Resolves once the panel has sent them. */
export function runCommands(commands: string[]): Promise<void> {
  if (!embedded || !state.connected) return Promise.reject(new Error('Not running inside the panel'))
  const id = Math.random().toString(36).slice(2)

  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pending.delete(id)
      reject(new Error('The panel did not answer'))
    }, 8000)
    pending.set(id, { resolve, reject, timer })
    post({ type: 'run', id, commands })
  })
}

/**
 * The supported version closest to what the server runs. Versions are compared as minor * 100 + patch (1.21.4 is 2104),
 * anything newer than the list (26.x and up) counts as the newest. A tie goes to the older version.
 */
export function nearestVersion<T extends { id: string }>(raw: string | undefined, versions: T[]): T | undefined {
  const rank = (value: string): number | null => {
    const m = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(value.trim())
    if (!m) return null
    const major = Number(m[1])
    if (major !== 1) return major > 1 ? 1_000_000 + major * 100 + Number(m[2] || 0) : null

    return Number(m[2] || 0) * 100 + Number(m[3] || 0)
  }

  const target = raw ? rank(raw) : null
  if (target === null) return undefined

  let best: T | undefined
  let bestDistance = Infinity
  let bestRank = Infinity
  for (const v of versions) {
    const r = rank(v.id)
    if (r === null) continue
    const distance = Math.abs(r - target)
    if (distance < bestDistance || (distance === bestDistance && r < bestRank)) {
      best = v
      bestDistance = distance
      bestRank = r
    }
  }

  return best
}
