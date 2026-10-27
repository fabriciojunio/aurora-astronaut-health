// The CSP enforces Trusted Types, and registering a worker is a script-URL sink, so the only URL
// this policy will ever produce is the app's own service worker.

interface TrustedTypePolicy {
  createScriptURL(url: string): unknown
}
interface TrustedTypesFactory {
  createPolicy(name: string, rules: { createScriptURL: (url: string) => string }): TrustedTypePolicy
}

export const SERVICE_WORKER_URL = '/sw.js'

export function serviceWorkerUrl(factory: TrustedTypesFactory | undefined): string | unknown {
  if (!factory) return SERVICE_WORKER_URL
  const policy = factory.createPolicy('aurora-sw', {
    createScriptURL: (url) => {
      if (url !== SERVICE_WORKER_URL) throw new TypeError('Only the AURORA service worker may be registered')
      return url
    },
  })
  return policy.createScriptURL(SERVICE_WORKER_URL)
}

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return
  const factory = (globalThis as { trustedTypes?: TrustedTypesFactory }).trustedTypes
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(serviceWorkerUrl(factory) as string, { scope: '/' }).catch(() => {
      // Without the worker the app still runs online; offline use is what is lost.
    })
  })
}
