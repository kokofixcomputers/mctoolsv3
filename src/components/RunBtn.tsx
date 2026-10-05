import { useState } from 'react'
import { Check, Play } from 'lucide-react'
import { embedded, runCommands, toCommands, usePanel } from '../lib/panel'

/**
 * Sends generated commands straight to the server console. Only exists inside the panel; the standalone site keeps
 * the copy buttons. Every line of the text is run as its own command.
 */
export function RunBtn({ text, disabled, className = '' }: { text: string; disabled?: boolean; className?: string }) {
  const panel = usePanel()
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'failed'>('idle')
  const [error, setError] = useState('')
  const [player, setPlayer] = useState('')

  if (!embedded || !panel.connected) return null

  // The console is nobody, so "@s" means nothing there and "@p" is the nearest to the world spawn. Offer the players the
  // panel knows about to run it as. The panel only learns about players who joined while it was open, so the list can
  // be empty even with people online, which only matters for "@s".
  const hasSelf = /@s\b/.test(text)
  const hasNearest = /@p\b/.test(text)
  const target = panel.players.includes(player) ? player : hasSelf ? panel.players[0] || '' : ''
  const commands = toCommands(target ? text.replace(/@[sp]\b/g, target) : text)
  const blocked = !panel.canRun
    ? 'You cannot send console commands on this server'
    : !panel.running
      ? 'The server is not running'
      : hasSelf && !target
        ? 'This runs as @s, which the console is not. Join the server or change the target to a player name or @p'
        : ''

  const run = async () => {
    if (!commands.length || blocked) return
    setState('busy')
    try {
      await runCommands(commands)
      setState('sent')
      setError('')
    } catch (e) {
      setState('failed')
      setError((e as Error).message)
    }
    setTimeout(() => setState('idle'), 1800)
  }

  return (
    <span className="inline-flex items-center gap-2">
      {(hasSelf || hasNearest) && panel.players.length > 0 && (
        <select
          value={target}
          onChange={(e) => setPlayer(e.target.value)}
          title="Run as"
          className="rounded-lg px-2 py-2 text-sm"
          style={{ border: '1px solid rgb(var(--border))', backgroundColor: 'rgb(var(--panel))', color: 'rgb(var(--text))' }}
        >
          {!hasSelf && <option value="">@p (nearest to spawn)</option>}
          {panel.players.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      )}
    <button
      onClick={run}
      disabled={disabled || !commands.length || !!blocked || state === 'busy'}
      title={blocked || error || (commands.length > 1 ? `Runs ${commands.length} commands` : 'Run on the server')}
      className={`btn-primary px-4 py-2 text-sm flex items-center gap-1.5 ${className}`}
    >
      {state === 'sent' ? (
        <><Check className="w-3.5 h-3.5" />Sent</>
      ) : state === 'failed' ? (
        <>Failed</>
      ) : (
        <><Play className="w-3.5 h-3.5" />Run</>
      )}
    </button>
    {blocked && <span className="text-xs max-w-[16rem]" style={{ color: 'rgb(var(--muted))' }}>{blocked}</span>}
    </span>
  )
}
