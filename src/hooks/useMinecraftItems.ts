import { useState, useEffect } from 'react'
import { useVersion } from '../contexts/VersionContext'

export interface McItem {
  id: number
  name: string
  displayName: string
  stackSize: number
}

const cache = new Map<string, McItem[]>()

export function useMinecraftItems() {
  const { version } = useVersion()
  const [items, setItems] = useState<McItem[]>(() => cache.get(version.id) ?? [])
  const [loading, setLoading] = useState(!cache.has(version.id))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (cache.has(version.id)) {
      setItems(cache.get(version.id)!)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    fetch(`https://raw.githubusercontent.com/PrismarineJS/minecraft-data/master/data/pc/${version.id}/items.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<McItem[]>
      })
      .then((data) => {
        cache.set(version.id, data)
        setItems(data)
        setLoading(false)
      })
      .catch((e) => {
        setError(e.message)
        setLoading(false)
      })
  }, [version.id])

  return { items, loading, error }
}
