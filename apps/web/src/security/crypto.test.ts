import fc from 'fast-check'
import {
  IntegrityError,
  canonicalJson,
  decryptJson,
  deriveEncryptionKey,
  encryptJson,
  exportPublicKey,
  fromBase64,
  generateSigningKeyPair,
  importPublicKey,
  randomBytes,
  sha256Hex,
  signText,
  toBase64,
  verifyText,
} from './crypto'

// Fewer iterations keep the suite fast; the production constant is tested separately below.
const FAST_ITERATIONS = 1_000
const salt = new Uint8Array(16).fill(7)

async function testKey(pin = '482913') {
  return deriveEncryptionKey(pin, salt, FAST_ITERATIONS)
}

describe('canonicalJson', () => {
  it('produces the same text regardless of key order', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 1, e: 2 }] } })).toBe(
      canonicalJson({ a: { c: [3, { e: 2, f: 1 }], d: 2 }, b: 1 }),
    )
  })

  it('drops undefined object fields the same way JSON does', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}')
  })

  it('rejects values that JSON cannot represent faithfully', () => {
    expect(() => canonicalJson(Number.NaN)).toThrow(TypeError)
    expect(() => canonicalJson(Infinity)).toThrow(TypeError)
    expect(() => canonicalJson(undefined)).toThrow(TypeError)
  })

  it('is stable and parseable for any JSON value', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const text = canonicalJson(value)
        expect(canonicalJson(JSON.parse(text))).toBe(text)
      }),
    )
  })
})

describe('base64', () => {
  it('round-trips any byte array', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 512 }), (bytes) => {
        expect([...fromBase64(toBase64(bytes))]).toEqual([...bytes])
      }),
    )
  })

  it('generates random bytes of the requested size that differ between calls', () => {
    const a = randomBytes(32)
    const b = randomBytes(32)
    expect(a).toHaveLength(32)
    expect(toBase64(a)).not.toBe(toBase64(b))
  })
})

describe('sha256Hex', () => {
  it('matches the published test vector for "abc"', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})

describe('key derivation', () => {
  it('derives a non-extractable AES-GCM key', async () => {
    const key = await testKey()
    expect(key.extractable).toBe(false)
    expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 })
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow()
  })

  it('uses the OWASP iteration count by default', async () => {
    const { PBKDF2_ITERATIONS } = await import('./crypto')
    expect(PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(600_000)
  })

  it('cannot decrypt with a key derived from a different PIN', async () => {
    const payload = await encryptJson(await testKey('111111'), { hr: 62 }, 'vitals:1')
    await expect(decryptJson(await testKey('222222'), payload, 'vitals:1')).rejects.toThrow(
      IntegrityError,
    )
  })

  it('cannot decrypt with a key derived from a different salt', async () => {
    const payload = await encryptJson(await testKey(), { hr: 62 }, 'vitals:1')
    const otherSalt = new Uint8Array(16).fill(9)
    const otherKey = await deriveEncryptionKey('482913', otherSalt, FAST_ITERATIONS)
    await expect(decryptJson(otherKey, payload, 'vitals:1')).rejects.toThrow(IntegrityError)
  })
})

describe('authenticated encryption', () => {
  it('round-trips any JSON value', async () => {
    const key = await testKey()
    await fc.assert(
      fc.asyncProperty(fc.jsonValue(), async (value) => {
        const payload = await encryptJson(key, value, 'ctx')
        const back = await decryptJson(key, payload, 'ctx')
        expect(canonicalJson(back)).toBe(canonicalJson(JSON.parse(JSON.stringify(value))))
      }),
      { numRuns: 50 },
    )
  })

  it('uses a fresh IV every time, so equal data never produces equal ciphertext', async () => {
    const key = await testKey()
    const a = await encryptJson(key, { hr: 62 }, 'ctx')
    const b = await encryptJson(key, { hr: 62 }, 'ctx')
    expect(a.iv).not.toBe(b.iv)
    expect(a.ciphertext).not.toBe(b.ciphertext)
  })

  it('does not leak plaintext into the stored payload', async () => {
    const payload = await encryptJson(await testKey(), { note: 'headache since morning' }, 'ctx')
    expect(JSON.stringify(payload)).not.toContain('headache')
  })

  it('detects any single flipped bit in the ciphertext', async () => {
    const key = await testKey()
    const payload = await encryptJson(key, { hr: 62, spo2: 98 }, 'ctx')
    const bytes = fromBase64(payload.ciphertext)
    await fc.assert(
      fc.asyncProperty(fc.nat({ max: bytes.length * 8 - 1 }), async (bit) => {
        const tampered = new Uint8Array(bytes)
        tampered[bit >> 3]! ^= 1 << (bit & 7)
        await expect(
          decryptJson(key, { ...payload, ciphertext: toBase64(tampered) }, 'ctx'),
        ).rejects.toThrow(IntegrityError)
      }),
      { numRuns: 40 },
    )
  })

  it('refuses a ciphertext moved to another record (context binding)', async () => {
    const key = await testKey()
    const payload = await encryptJson(key, { owner: 'crew-1' }, 'checkins:crew-1:42')
    await expect(decryptJson(key, payload, 'checkins:crew-2:42')).rejects.toThrow(IntegrityError)
  })

  it('refuses a payload whose IV was replaced', async () => {
    const key = await testKey()
    const payload = await encryptJson(key, { hr: 62 }, 'ctx')
    const other = await encryptJson(key, { hr: 62 }, 'ctx')
    await expect(decryptJson(key, { ...payload, iv: other.iv }, 'ctx')).rejects.toThrow(
      IntegrityError,
    )
  })
})

describe('signatures', () => {
  it('keeps the private key non-extractable', async () => {
    const pair = await generateSigningKeyPair()
    expect(pair.privateKey.extractable).toBe(false)
    await expect(crypto.subtle.exportKey('jwk', pair.privateKey)).rejects.toThrow()
  })

  it('verifies a valid signature and rejects any change to the text', async () => {
    const pair = await generateSigningKeyPair()
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1 }), fc.string({ minLength: 1 }), async (a, b) => {
        fc.pre(a !== b)
        const signature = await signText(pair.privateKey, a)
        expect(await verifyText(pair.publicKey, a, signature)).toBe(true)
        expect(await verifyText(pair.publicKey, b, signature)).toBe(false)
      }),
      { numRuns: 30 },
    )
  })

  it('rejects a signature made by another key', async () => {
    const alice = await generateSigningKeyPair()
    const mallory = await generateSigningKeyPair()
    const forged = await signText(mallory.privateKey, 'dose=0')
    expect(await verifyText(alice.publicKey, 'dose=0', forged)).toBe(false)
  })

  it('returns false instead of throwing for garbage signatures', async () => {
    const pair = await generateSigningKeyPair()
    expect(await verifyText(pair.publicKey, 'text', 'not-base64!!')).toBe(false)
    expect(await verifyText(pair.publicKey, 'text', toBase64(new Uint8Array(3)))).toBe(false)
  })

  it('exports and imports the public key for the ground station', async () => {
    const pair = await generateSigningKeyPair()
    const jwk = await exportPublicKey(pair.publicKey)
    expect(jwk).toMatchObject({ kty: 'EC', crv: 'P-256' })
    expect(jwk).not.toHaveProperty('d') // the private scalar must never appear
    const imported = await importPublicKey(jwk)
    const signature = await signText(pair.privateKey, 'batch-1')
    expect(await verifyText(imported, 'batch-1', signature)).toBe(true)
  })
})
