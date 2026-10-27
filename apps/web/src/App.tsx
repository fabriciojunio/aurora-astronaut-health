import { useCallback, useState } from 'react'
import type { Fetcher } from './data/loader'
import type { Vault } from './storage/vault'
import { LockScreen } from './ui/LockScreen'
import { Mission } from './ui/Mission'
import { browserFetcher } from './ui/useVerifiedData'

interface Props {
  dbName?: string
  iterations?: number
  fetcher?: Fetcher
}

export default function App({ dbName, iterations, fetcher = browserFetcher }: Props) {
  const [vault, setVault] = useState<Vault | null>(null)

  const lock = useCallback(() => {
    vault?.lock()
    setVault(null)
  }, [vault])

  if (!vault) return <LockScreen onUnlock={setVault} dbName={dbName} iterations={iterations} />
  return <Mission vault={vault} fetcher={fetcher} onLock={lock} />
}
