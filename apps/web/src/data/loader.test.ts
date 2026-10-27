import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DataIntegrityError,
  hourlyDoseSchema,
  loadManifest,
  loadSnapshot,
  protonSchema,
  studySchema,
} from './loader'
import { dailyDoses, spikeDays } from '../domain/radiation'
import { diskFetcher } from '../test/diskFetcher'

const publicDir = resolve(import.meta.dirname, '../../public')

const realFile = (name: string) => readFileSync(resolve(publicDir, 'data', name), 'utf-8')

describe('real snapshots', () => {
  it('loads the manifest and every listed snapshot with matching checksums', async () => {
    const fetcher = diskFetcher()
    const manifest = await loadManifest(fetcher)
    expect(manifest.snapshots.map((s) => s.file)).toEqual([
      'goes-protons-latest.json',
      'osdr-studies.json',
      'radiation-may-2024.json',
    ])
    const radiation = await loadSnapshot(fetcher, manifest, 'radiation-may-2024.json', hourlyDoseSchema)
    const protons = await loadSnapshot(fetcher, manifest, 'goes-protons-latest.json', protonSchema)
    const studies = await loadSnapshot(fetcher, manifest, 'osdr-studies.json', studySchema)
    expect(radiation.records).toHaveLength(2750)
    expect(protons.records).toHaveLength(285)
    expect(studies.records).toHaveLength(33)
  })

  it('feeds the radiation model and shows the May 2024 storm on Mars', async () => {
    const fetcher = diskFetcher()
    const manifest = await loadManifest(fetcher)
    const { records } = await loadSnapshot(fetcher, manifest, 'radiation-may-2024.json', hourlyDoseSchema)
    const spikes = spikeDays(dailyDoses(records, 'mars_surface'))
    expect(spikes.map((d) => d.date)).toContain('2024-05-20')
  })
})

describe('rejects bad data', () => {
  it('rejects a file whose bytes changed, even by one character', async () => {
    const tampered = realFile('goes-protons-latest.json').replace('"storm_level":0', '"storm_level":1')
    const fetcher = diskFetcher({ '/data/goes-protons-latest.json': tampered })
    const manifest = await loadManifest(fetcher)
    await expect(loadSnapshot(fetcher, manifest, 'goes-protons-latest.json', protonSchema)).rejects.toThrow(/checksum/)
  })

  it('rejects files that are not in the manifest', async () => {
    const fetcher = diskFetcher()
    const manifest = await loadManifest(fetcher)
    await expect(loadSnapshot(fetcher, manifest, 'other.json', protonSchema)).rejects.toBeInstanceOf(DataIntegrityError)
  })

  it('rejects a manifest that points outside the data folder', async () => {
    const manifest = JSON.parse(realFile('manifest.json')) as { snapshots: { file: string }[] }
    manifest.snapshots[0]!.file = '../index.html'
    const fetcher = diskFetcher({ '/data/manifest.json': JSON.stringify(manifest) })
    await expect(loadManifest(fetcher)).rejects.toThrow(/expected format/)
  })

  it('rejects a manifest with a non-HTTPS source', async () => {
    const manifest = JSON.parse(realFile('manifest.json')) as { snapshots: { url: string }[] }
    manifest.snapshots[0]!.url = 'javascript:alert(1)'
    const fetcher = diskFetcher({ '/data/manifest.json': JSON.stringify(manifest) })
    await expect(loadManifest(fetcher)).rejects.toThrow(DataIntegrityError)
  })

  it('rejects invalid JSON, invalid UTF-8 and missing files', async () => {
    await expect(loadManifest(diskFetcher({ '/data/manifest.json': '{not json' }))).rejects.toThrow(/not valid JSON/)
    await expect(loadManifest(diskFetcher({ '/data/manifest.json': new Uint8Array([0xff, 0xfe]) }))).rejects.toThrow(/not valid JSON/)
    await expect(loadManifest(diskFetcher(), '/missing')).rejects.toThrow(/Could not load/)
  })

  it('rejects oversized files before parsing them', async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1)
    await expect(loadManifest(diskFetcher({ '/data/manifest.json': big }))).rejects.toThrow(/larger than allowed/)
  })

  it('rejects records with the right checksum but the wrong shape', async () => {
    const body = JSON.stringify({ records: [{ time: 'yesterday', flux_10mev: -1, storm_level: 9 }] })
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))
    const sha256 = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
    const manifest = {
      version: 1,
      snapshots: [{ file: 'bad.json', sha256, records: 1, source: 'test', url: 'https://example.org/', retrievedAt: '2026-10-27T00:00:00+00:00' }],
    }
    const fetcher = diskFetcher({ '/data/manifest.json': JSON.stringify(manifest), '/data/bad.json': body })
    await expect(loadSnapshot(fetcher, await loadManifest(fetcher), 'bad.json', protonSchema)).rejects.toThrow(/unexpected format/)
  })

  it('rejects a record count different from the manifest', async () => {
    const body = JSON.stringify({ records: [] })
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))
    const sha256 = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
    const manifest = {
      version: 1,
      snapshots: [{ file: 'short.json', sha256, records: 5, source: 'test', url: 'https://example.org/', retrievedAt: '2026-10-27T00:00:00+00:00' }],
    }
    const fetcher = diskFetcher({ '/data/manifest.json': JSON.stringify(manifest), '/data/short.json': body })
    await expect(loadSnapshot(fetcher, await loadManifest(fetcher), 'short.json', protonSchema)).rejects.toThrow(/number of records/)
  })
})
