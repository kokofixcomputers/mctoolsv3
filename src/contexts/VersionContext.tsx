import { createContext, useContext, useState, type ReactNode } from 'react'

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
  return <Ctx.Provider value={{ version, setVersion }}>{children}</Ctx.Provider>
}

export function useVersion() {
  return useContext(Ctx)
}
