import { useMemo, useState } from 'react'
import { embedded, usePanel } from '../lib/panel'

const SELECTORS = ['@a', '@p', '@r', '@s', '@e']

interface Props {
  value: string
  onChange: (value: string) => void
  className?: string
  wrapperClassName?: string
  placeholder?: string
}

/**
 * A text input for a command target. Inside the panel it completes the names of the players the panel knows are online
 * (and the target selectors): Tab accepts the highlighted suggestion, the arrow keys move it, a click picks one.
 * On the standalone site it is a plain input.
 */
export function TargetInput({ value, onChange, className, wrapperClassName = '', placeholder }: Props) {
  const panel = usePanel()
  const [focused, setFocused] = useState(false)
  const [index, setIndex] = useState(0)

  const suggestions = useMemo(() => {
    if (!embedded || !panel.connected) return []
    const typed = value.trim().toLowerCase()
    return [...panel.players, ...SELECTORS].filter((name) => name.toLowerCase().startsWith(typed) && name !== value.trim()).slice(0, 8)
  }, [value, panel.connected, panel.players])

  const choose = (name: string) => {
    onChange(name)
    setIndex(0)
  }
  const open = focused && suggestions.length > 0
  const current = Math.min(index, Math.max(suggestions.length - 1, 0))

  return (
    <div className={`relative ${wrapperClassName}`}>
      <input
        className={className}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value)
          setIndex(0)
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (!open) return
          if (e.key === 'Tab' && !e.shiftKey) {
            e.preventDefault()
            choose(suggestions[current])
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            setIndex((current + (e.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length)
          } else if (e.key === 'Escape') {
            setFocused(false)
          }
        }}
        autoComplete="off"
        spellCheck={false}
      />
      {open && (
        <ul
          className="absolute left-0 top-full z-50 mt-1 min-w-full w-max max-h-56 overflow-auto rounded-lg py-1 text-sm font-mono"
          style={{
            backgroundColor: 'rgb(var(--panel))',
            border: '1px solid rgb(var(--border))',
            boxShadow: '0 12px 30px rgba(0,0,0,.14)',
          }}
        >
          {suggestions.map((name, i) => (
            <li
              key={name}
              // mousedown so it lands before the input loses focus
              onMouseDown={(e) => {
                e.preventDefault()
                choose(name)
              }}
              onMouseEnter={() => setIndex(i)}
              className="flex items-center justify-between gap-4 px-3 py-1.5 cursor-pointer"
              style={{
                color: 'rgb(var(--text))',
                backgroundColor: i === current ? 'rgb(var(--border) / 0.5)' : 'transparent',
              }}
            >
              <span>{name}</span>
              <span className="text-xs" style={{ color: 'rgb(var(--muted))' }}>
                {name.startsWith('@') ? 'selector' : 'online'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
