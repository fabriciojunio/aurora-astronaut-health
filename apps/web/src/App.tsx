import { useCallback, useState } from 'react'
import type { Fetcher } from './data/loader'
import { LanguageProvider } from './i18n/LanguageProvider'
import type { Lang } from './i18n/messages'
import type { Vault } from './storage/vault'
import { LockScreen } from './ui/LockScreen'
import { Mission } from './ui/Mission'
import { browserFetcher } from './ui/useVerifiedData'

interface Props {
  dbName?: string
  iterations?: number
  fetcher?: Fetcher
  lang?: Lang
}

export default function App({ dbName, iterations, fetcher = browserFetcher, lang }: Props) {
  const [vault, setVault] = useState<Vault | null>(null)

  const lock = useCallback(() => {
    vault?.lock()
    setVault(null)
  }, [vault])

  return (
    <LanguageProvider initial={lang}>
      {vault ? (
        <Mission vault={vault} fetcher={fetcher} onLock={lock} kdfIterations={iterations} />
      ) : (
        <LockScreen onUnlock={setVault} dbName={dbName} iterations={iterations} />
      )}
    </LanguageProvider>
  )
}
