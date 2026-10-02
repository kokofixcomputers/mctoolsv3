import { sameEvents, hasEvents, type RichLine, type RichLines, type TextEvents, type TextSegment } from '../../types/richText'

/**
 * 'json' — 1.21.4 and older: camelCase clickEvent/hoverEvent with value/contents.
 * 'snbt' — 1.21.5+: snake_case click_event/hover_event with action-specific fields.
 * JSON is valid SNBT, so both are emitted with JSON.stringify.
 */
export type TellrawFormat = 'json' | 'snbt'

export function tellrawFormatFor(versionId: string): TellrawFormat {
  const [, minor = 0, patch = 0] = versionId.split('.').map(Number)
  return minor > 21 || (minor === 21 && patch >= 5) ? 'snbt' : 'json'
}

type Component = string | Record<string, unknown> | Component[]

const ns = (id: string) => (id.includes(':') ? id : `minecraft:${id}`)

function styleObj(seg: TextSegment): Record<string, unknown> {
  const obj: Record<string, unknown> = { text: seg.text }
  if (seg.color) obj.color = seg.color
  if (seg.bold) obj.bold = true
  if (seg.italic) obj.italic = true
  if (seg.underlined) obj.underlined = true
  if (seg.strikethrough) obj.strikethrough = true
  if (seg.obfuscated) obj.obfuscated = true
  return obj
}

function lineToComponents(line: RichLine, fmt: TellrawFormat): Component[] {
  const segs = line.filter(s => s.text)
  const out: Component[] = []
  let i = 0
  while (i < segs.length) {
    const ev = segs[i].events
    if (!hasEvents(ev)) { out.push(styleObj(segs[i])); i++; continue }
    // Group consecutive segments sharing the same events (e.g. a gradient link)
    // so long hover text is emitted once.
    let j = i + 1
    while (j < segs.length && sameEvents(segs[j].events, ev)) j++
    const evObj = eventsObj(ev, fmt)
    if (j - i === 1) out.push({ ...styleObj(segs[i]), ...evObj })
    else out.push({ text: '', ...evObj, extra: segs.slice(i, j).map(styleObj) })
    i = j
  }
  return out
}

/** Multiple lines joined with newlines. Leading "" stops style inheritance between parts. */
export function linesToComponent(lines: RichLines, fmt: TellrawFormat): Component[] {
  const parts: Component[] = ['']
  lines.forEach((line, i) => {
    if (i > 0) parts.push('\n')
    parts.push(...lineToComponents(line, fmt))
  })
  return parts
}

function eventsObj(ev: TextEvents, fmt: TellrawFormat): Record<string, unknown> {
  const obj: Record<string, unknown> = {}

  if (ev.click) {
    const { action, value } = ev.click
    if (fmt === 'json') {
      obj.clickEvent = { action, value }
    } else {
      const field =
        action === 'open_url' ? { url: value }
        : action === 'change_page' ? { page: parseInt(value) || 1 }
        : action === 'copy_to_clipboard' ? { value }
        : { command: value }
      obj.click_event = { action, ...field }
    }
  }

  const h = ev.hover
  if (h) {
    if (h.action === 'show_text') {
      const text = linesToComponent(h.lines, fmt)
      obj[fmt === 'json' ? 'hoverEvent' : 'hover_event'] =
        fmt === 'json' ? { action: 'show_text', contents: text } : { action: 'show_text', value: text }
    } else if (h.action === 'show_item') {
      const item = { id: ns(h.id), count: h.count }
      obj[fmt === 'json' ? 'hoverEvent' : 'hover_event'] =
        fmt === 'json' ? { action: 'show_item', contents: item } : { action: 'show_item', ...item }
    } else {
      const name = h.name.some(s => s.text) ? linesToComponent([h.name], fmt) : undefined
      obj[fmt === 'json' ? 'hoverEvent' : 'hover_event'] = fmt === 'json'
        ? { action: 'show_entity', contents: { type: ns(h.id), id: h.uuid, ...(name ? { name } : {}) } }
        : { action: 'show_entity', id: ns(h.id), uuid: h.uuid, ...(name ? { name } : {}) }
    }
  }

  if (ev.insertion) obj.insertion = ev.insertion
  return obj
}

export function buildTellraw(lines: RichLines, target: string, fmt: TellrawFormat): { json: string; command: string } {
  const json = JSON.stringify(linesToComponent(lines, fmt))
  return { json, command: `/tellraw ${target || '@a'} ${json}` }
}
