// Emits sw.js at build time with the exact list of files to keep offline. The cache name is a hash of
// that list and of the public files' bytes, so any new build or new data snapshot replaces the old cache.

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { Plugin } from 'vite'

const TEMPLATE = new URL('./sw-template.js', import.meta.url)

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  })
}

export function serviceWorker(): Plugin {
  let publicDir = ''
  return {
    name: 'aurora-service-worker',
    apply: 'build',
    configResolved(config) {
      publicDir = config.publicDir
    },
    generateBundle(_, bundle) {
      const hash = createHash('sha256')
      const publicFiles = filesUnder(publicDir).map((path) => {
        hash.update(readFileSync(path))
        return `/${relative(publicDir, path).split(sep).join('/')}`
      })
      const built = Object.keys(bundle)
        .filter((name) => name !== 'index.html' && !name.endsWith('.map'))
        .map((name) => `/${name}`)
      const precache = ['/', ...built, ...publicFiles].sort()
      hash.update(precache.join('\n'))
      const header = [
        `const VERSION = ${JSON.stringify(hash.digest('hex').slice(0, 16))}`,
        `const PRECACHE = ${JSON.stringify(precache)}`,
      ].join('\n')
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: `${header}\n${readFileSync(TEMPLATE, 'utf-8')}` })
    },
  }
}
