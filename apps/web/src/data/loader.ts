// Loads the NASA/NOAA snapshots produced by the data pipeline. Every file is checked against the
// SHA-256 in the manifest before it is parsed, and every record is validated, so a corrupted cache or
// a tampered file is rejected instead of being shown as real data.

import { z } from 'zod'

export class DataIntegrityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DataIntegrityError'
  }
}

const SNAPSHOT_FILE = /^[a-z0-9-]{1,64}\.json$/
const MAX_BYTES = 10 * 1024 * 1024

const manifestSchema = z.strictObject({
  version: z.literal(1),
  snapshots: z.array(
    z.strictObject({
      file: z.string().regex(SNAPSHOT_FILE),
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
      records: z.number().int().nonnegative(),
      source: z.string().max(200),
      url: z.url({ protocol: /^https$/ }),
      retrievedAt: z.iso.datetime({ offset: true }),
    }),
  ),
})

export type Manifest = z.infer<typeof manifestSchema>
export type ManifestEntry = Manifest['snapshots'][number]

const finite = z.number().finite()

export const hourlyDoseSchema = z.strictObject({
  instrument: z.string().max(40),
  environment: z.enum(['iss', 'lunar_orbit', 'mars_surface']),
  hour: z.iso.datetime({ local: true }),
  mean_rate: finite.nonnegative(),
  max_rate: finite.nonnegative(),
  samples: z.number().int().positive(),
})

export const protonSchema = z.strictObject({
  time: z.iso.datetime(),
  flux_10mev: finite.nonnegative(),
  storm_level: z.number().int().min(0).max(5),
})

export const studySchema = z.strictObject({
  accession: z.string().regex(/^OSD-\d{1,6}$/),
  title: z.string().max(500),
  organism: z.string().max(200),
  flight_program: z.string().max(200),
  topic: z.string().max(40),
  url: z.url({ protocol: /^https$/, hostname: /^osdr\.nasa\.gov$/ }),
})

export type Fetcher = (path: string) => Promise<{ ok: boolean; arrayBuffer(): Promise<ArrayBuffer> }>

async function sha256OfBytes(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function fetchBytes(fetcher: Fetcher, path: string): Promise<ArrayBuffer> {
  const response = await fetcher(path)
  if (!response.ok) throw new DataIntegrityError(`Could not load ${path}`)
  const bytes = await response.arrayBuffer()
  if (bytes.byteLength > MAX_BYTES) throw new DataIntegrityError(`${path} is larger than allowed`)
  return bytes
}

function parseJson(bytes: ArrayBuffer, path: string): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new DataIntegrityError(`${path} is not valid JSON`)
  }
}

export async function loadManifest(fetcher: Fetcher, base = '/data'): Promise<Manifest> {
  const path = `${base}/manifest.json`
  const result = manifestSchema.safeParse(parseJson(await fetchBytes(fetcher, path), path))
  if (!result.success) throw new DataIntegrityError('Manifest does not match the expected format')
  return result.data
}

export async function loadSnapshot<T>(
  fetcher: Fetcher,
  manifest: Manifest,
  file: string,
  recordSchema: z.ZodType<T>,
  base = '/data',
): Promise<{ entry: ManifestEntry; records: T[] }> {
  const entry = manifest.snapshots.find((s) => s.file === file)
  if (!entry) throw new DataIntegrityError(`${file} is not listed in the manifest`)
  const path = `${base}/${entry.file}`
  const bytes = await fetchBytes(fetcher, path)
  if ((await sha256OfBytes(bytes)) !== entry.sha256) {
    throw new DataIntegrityError(`${file} does not match its checksum`)
  }
  const result = z
    .object({ records: z.array(recordSchema) })
    .safeParse(parseJson(bytes, path))
  if (!result.success) throw new DataIntegrityError(`${file} has records in an unexpected format`)
  if (result.data.records.length !== entry.records) {
    throw new DataIntegrityError(`${file} has a different number of records than the manifest`)
  }
  return { entry, records: result.data.records }
}
