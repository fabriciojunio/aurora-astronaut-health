import { useEffect, useState } from 'react'
import type { z } from 'zod'
import { loadModel, type AnomalyModel } from '../ai/isolationForest'
import {
  hourlyDoseSchema,
  loadJson,
  loadManifest,
  loadSnapshot,
  protonSchema,
  studySchema,
  type Fetcher,
  type ManifestEntry,
} from '../data/loader'
import type { HourlyDose } from '../domain/radiation'

export const MODEL_PATH = '/models/anomaly-v1.json'

export type Loadable<T> = { status: 'loading' } | { status: 'ready'; value: T } | { status: 'error' }

export interface RealData {
  radiation: { entry: ManifestEntry; records: HourlyDose[] }
  protons: { entry: ManifestEntry; records: z.infer<typeof protonSchema>[] }
  studies: { entry: ManifestEntry; records: z.infer<typeof studySchema>[] }
}

export const browserFetcher: Fetcher = (path) => fetch(path, { credentials: 'omit', cache: 'no-cache' })

async function loadAnomalyModel(fetcher: Fetcher): Promise<AnomalyModel> {
  return loadModel(await loadJson(fetcher, MODEL_PATH))
}

async function loadRealData(fetcher: Fetcher): Promise<RealData> {
  const manifest = await loadManifest(fetcher)
  const [radiation, protons, studies] = await Promise.all([
    loadSnapshot(fetcher, manifest, 'radiation-may-2024.json', hourlyDoseSchema),
    loadSnapshot(fetcher, manifest, 'goes-protons-latest.json', protonSchema),
    loadSnapshot(fetcher, manifest, 'osdr-studies.json', studySchema),
  ])
  return { radiation, protons, studies }
}

// The reason a file was refused is not shown on screen: the crew only needs to know it was refused.
function useLoad<T>(load: (fetcher: Fetcher) => Promise<T>, fetcher: Fetcher): Loadable<T> {
  const [state, setState] = useState<Loadable<T>>({ status: 'loading' })
  useEffect(() => {
    let active = true
    load(fetcher).then(
      (value) => active && setState({ status: 'ready', value }),
      () => active && setState({ status: 'error' }),
    )
    return () => {
      active = false
    }
  }, [load, fetcher])
  return state
}

export function useVerifiedData(fetcher: Fetcher) {
  return { model: useLoad(loadAnomalyModel, fetcher), data: useLoad(loadRealData, fetcher) }
}
