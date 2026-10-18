/**
 * Colors the panel hands over so the tools look like part of it. Every value is a hex color. Anything missing keeps the
 * tools' own color, and none of it applies on the standalone site.
 *
 *   mode               'light' or 'dark': turns the tools' own dark styles (the .dark class) on or off
 *   bg                 the color of the page behind the cards
 *   accent, accentFg   buttons, links, focus rings, and the text on a button
 *   text, muted        body text and the dimmer text
 *   panel, border      card background and outlines
 *   success, danger, warning
 *   scale              { 50: '#...', 100: ..., 950: ... } replaces the violet shades the tools use for highlights
 */
export type PanelTheme = Partial<Record<'accent' | 'accentFg' | 'bg' | 'text' | 'muted' | 'panel' | 'border' | 'success' | 'danger' | 'warning', string>> & {
  mode?: 'light' | 'dark'
  scale?: Record<string, string>
}

const VARIABLES: Record<string, string> = {
  accent: '--accent',
  accentFg: '--accent-fg',
  bg: '--bg',
  text: '--text',
  muted: '--muted',
  panel: '--panel',
  border: '--border',
  success: '--success',
  danger: '--danger',
  warning: '--warning',
}

/** "#1447e6" or "#14e" as the "20 71 230" that the stylesheet's rgb(var(--x) / alpha) expects, null when it is not a hex color. */
export function hexToChannels(hex: unknown): string | null {
  if (typeof hex !== 'string') return null
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const full = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1]

  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)).join(' ')
}

const applied = new Set<string>()

/** Sets the colors on the document. Colors that are no longer in the theme go back to the stylesheet's value. */
export function applyTheme(theme: PanelTheme | undefined) {
  const root = document.documentElement
  // Without a mode the tools keep what they have (the standalone site, an older panel).
  if (theme?.mode === 'dark' || theme?.mode === 'light') {
    root.classList.toggle('dark', theme.mode === 'dark')
    root.style.colorScheme = theme.mode
  }
  const next = new Map<string, string>()

  for (const [key, variable] of Object.entries(VARIABLES)) {
    const channels = hexToChannels((theme as Record<string, unknown> | undefined)?.[key])
    if (channels) next.set(variable, channels)
  }
  for (const [shade, hex] of Object.entries(theme?.scale ?? {})) {
    const channels = hexToChannels(hex)
    if (channels && /^\d{2,3}$/.test(shade)) next.set(`--violet-${shade}`, channels)
  }

  applied.forEach((variable) => {
    if (!next.has(variable)) root.style.removeProperty(variable)
  })
  applied.clear()
  next.forEach((channels, variable) => {
    root.style.setProperty(variable, channels)
    applied.add(variable)
  })
}
