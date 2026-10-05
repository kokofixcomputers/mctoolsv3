import { useState } from 'react'
import { Check, FolderInput } from 'lucide-react'
import { embedded, saveSchematic, usePanel } from '../lib/panel'

/**
 * Puts a schematic into the server's WorldEdit schematics folder, ready for //schem load. Only exists inside the panel
 * and only when WorldEdit is installed on the server.
 */
export function SaveSchematicBtn({
  build,
  name,
  disabled,
  className = '',
}: {
  build: () => Promise<Uint8Array>
  name: string
  disabled?: boolean
  className?: string
}) {
  const panel = usePanel()
  const [state, setState] = useState<'idle' | 'busy' | 'saved' | 'failed'>('idle')
  const [message, setMessage] = useState('')

  if (!embedded || !panel.connected || !panel.worldEdit) return null

  const blocked = panel.canEdit ? '' : 'You cannot edit files on this server'

  const save = async () => {
    setState('busy')
    try {
      const path = await saveSchematic(name, await build())
      setMessage(path)
      setState('saved')
    } catch (e) {
      setMessage((e as Error).message)
      setState('failed')
    }
    setTimeout(() => setState('idle'), 6000)
  }

  const file = message.split('/').pop() || name

  return (
    <>
      <button
        onClick={save}
        disabled={disabled || !!blocked || state === 'busy'}
        title={blocked || `Save into ${panel.worldEdit}`}
        className={`btn-primary flex items-center justify-center gap-2 py-2 disabled:opacity-40 ${className}`}
      >
        {state === 'saved' ? <Check className="w-4 h-4" /> : <FolderInput className="w-4 h-4" />}
        {state === 'busy' ? 'Saving…' : state === 'saved' ? 'Saved to WorldEdit' : 'Save to WorldEdit'}
      </button>
      {state === 'saved' && (
        <p className="text-xs" style={{ color: 'rgb(var(--muted))' }}>
          Saved as {message}. Load it in game with <code className="font-mono">//schem load {file.replace(/\.schem$/, '')}</code>.
        </p>
      )}
      {state === 'failed' && <p className="text-xs" style={{ color: 'rgb(var(--danger))' }}>{message}</p>}
    </>
  )
}
