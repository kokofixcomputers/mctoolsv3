import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { nearestVersion, usePanel } from '../lib/panel'

export interface McVersion {
  id: string
  label: string
}

export const MC_VERSIONS: McVersion[] = [
  { id: '1.21.1',  label: '1.21.1' },
  { id: '1.21.5',  label: '1.21.5' },
  { id: '1.21.11', label: '1.21.11' },
]

interface VersionCtx {
  version: McVersion
  setVersion: (v: McVersion) => void
}

const Ctx = createContext<VersionCtx>({
  version: MC_VERSIONS[1],
  setVersion: () => {},
})

export function VersionProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState<McVersion>(MC_VERSIONS[1])
  const panel = usePanel()

  // Inside the panel, start on the supported version closest to the one the server runs. Choosing another one by hand
  // sticks until the panel reports a different server version.
  useEffect(() => {
    const match = nearestVersion(panel.version, MC_VERSIONS)
    if (match) setVersion(match)
  }, [panel.version])

  return <Ctx.Provider value={{ version, setVersion }}>{children}</Ctx.Provider>
}

export function useVersion() {
  return useContext(Ctx)
}
