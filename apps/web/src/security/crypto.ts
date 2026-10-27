// All cryptography goes through the Web Crypto API: no third-party crypto code, and keys can be
// created as non-extractable so a script running in the page cannot read the raw key material.

export const PBKDF2_ITERATIONS = 600_000 // OWASP Password Storage Cheat Sheet, PBKDF2-HMAC-SHA256
const AES_KEY_BITS = 256
const IV_BYTES = 12 // 96-bit IV is the recommended size for AES-GCM

export class IntegrityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IntegrityError'
  }
}

export interface EncryptedPayload {
  v: 1
  iv: string
  ciphertext: string
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length))
}

/**
 * Serializes with sorted keys so the same data always produces the same bytes.
 * Signatures and hashes depend on this; plain JSON.stringify follows insertion order.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new TypeError('canonicalJson does not accept NaN or Infinity')
    }
    if (value === undefined) throw new TypeError('canonicalJson does not accept undefined')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function deriveEncryptionKey(
  pin: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: AES_KEY_BITS },
    false,
    ['encrypt', 'decrypt'],
  )
}

/**
 * `context` is bound as AES-GCM additional data: a ciphertext created for one record cannot be
 * moved to another record, because decryption with a different context fails.
 */
export async function encryptJson(
  key: CryptoKey,
  value: unknown,
  context: string,
): Promise<EncryptedPayload> {
  const iv = randomBytes(IV_BYTES)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(context) },
    key,
    encoder.encode(JSON.stringify(value)),
  )
  return { v: 1, iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) }
}

export async function decryptJson<T>(
  key: CryptoKey,
  payload: EncryptedPayload,
  context: string,
): Promise<T> {
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(payload.iv), additionalData: encoder.encode(context) },
      key,
      fromBase64(payload.ciphertext),
    )
    return JSON.parse(decoder.decode(plain)) as T
  } catch {
    throw new IntegrityError('Encrypted data failed authentication: wrong key, context or tampering')
  }
}

export async function generateSigningKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
    'verify',
  ])
}

export async function signText(privateKey: CryptoKey, text: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    encoder.encode(text),
  )
  return toBase64(new Uint8Array(signature))
}

export async function verifyText(
  publicKey: CryptoKey,
  text: string,
  signature: string,
): Promise<boolean> {
  try {
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      fromBase64(signature),
      encoder.encode(text),
    )
  } catch {
    return false
  }
}

export async function exportPublicKey(publicKey: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey('jwk', publicKey)
}

export async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'verify',
  ])
}
