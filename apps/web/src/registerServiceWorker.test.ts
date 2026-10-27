import { SERVICE_WORKER_URL, serviceWorkerUrl } from './registerServiceWorker'

describe('service worker URL under Trusted Types', () => {
  it('uses the plain URL where Trusted Types do not exist', () => {
    expect(serviceWorkerUrl(undefined)).toBe(SERVICE_WORKER_URL)
  })

  it('creates the one policy the CSP allows, and it only produces the app worker', () => {
    const created: { name: string; rule: (url: string) => string }[] = []
    const factory = {
      createPolicy: (name: string, rules: { createScriptURL: (url: string) => string }) => {
        created.push({ name, rule: rules.createScriptURL })
        return { createScriptURL: rules.createScriptURL }
      },
    }
    expect(serviceWorkerUrl(factory)).toBe('/sw.js')
    expect(created.map((c) => c.name)).toEqual(['aurora-sw'])
    expect(() => created[0]!.rule('https://evil.example/sw.js')).toThrow(TypeError)
    expect(() => created[0]!.rule('/sw.js?x=1')).toThrow(TypeError)
  })
})
