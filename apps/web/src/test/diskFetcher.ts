import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Fetcher } from '../data/loader'

const publicDir = resolve(import.meta.dirname, '../../public')

/** Serves files from `public/` the way the browser would, with optional replacements for tampering tests. */
export function diskFetcher(overrides: Record<string, string | Uint8Array> = {}): Fetcher {
  return async (path) => {
    const override = overrides[path]
    let bytes: Uint8Array
    try {
      bytes = override === undefined
        ? readFileSync(resolve(publicDir, `.${path}`))
        : typeof override === 'string' ? new TextEncoder().encode(override) : override
    } catch {
      return { ok: false, arrayBuffer: async () => new ArrayBuffer(0) }
    }
    const copy = new Uint8Array(bytes)
    return { ok: true, arrayBuffer: async () => copy.buffer }
  }
}
