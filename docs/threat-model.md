# Threat model

Scope: the AURORA web app on a crew tablet, the data snapshots it ships with, and the batches it
sends to the ground. Method: list what we protect, who could cause harm, then go through STRIDE for
each place data crosses a boundary.

## What we protect

| Asset | Why it matters |
|---|---|
| Health records (check-ins, vigilance tests, notes) | Medical data. A leak can hurt a career; on a small crew it is also personal. |
| Consent settings | Decide what leaves the device. Silently changing them is a privacy breach. |
| Audit trail | The record of who saved, shared or changed what. Useless if it can be edited. |
| Reference data and model | Wrong radiation data or a swapped model would give wrong advice. |
| Batches to the ground | The flight surgeon acts on them, so they must be authentic and complete. |

## Who could cause harm

- **Another crew member** with physical access to a shared or unlocked tablet. The most likely case.
- **Someone who gets the tablet's storage** (lost device, maintenance, a forensic copy).
- **A compromised relay or network** between the spacecraft and the ground.
- **A malicious or broken dependency** in the build.
- **The astronaut's own input**: free text and numbers that could be malformed or hostile.

Out of scope: an attacker who already runs code in the unlocked app's page, or controls the
operating system, the browser or the hardware. At that point they can read the screen, and no
in-page control can stop them.

## Threats and controls

| STRIDE | Threat | Control | Test |
|---|---|---|---|
| Spoofing | Someone opens the app as the astronaut | 6 to 12 digit PIN that rejects repeats and sequences; key derived with PBKDF2-SHA256, 600,000 iterations | `vault.test.ts`, `App.test.tsx` |
| Spoofing | PIN guessing | 5 free attempts, then exponential lockout up to 30 min, stored in the vault | `vault.test.ts`, `App.test.tsx` |
| Spoofing | Forged batch sent to the ground in the crew's name | ECDSA P-256 signature over the canonical batch; the ground verifies with the device public key | `outbox.test.ts`, `PrivacyView.test.tsx` |
| Tampering | Records edited or swapped in IndexedDB | AES-GCM with the collection and id as associated data; a moved or edited record fails to decrypt | `crypto.test.ts`, `vault.test.ts` |
| Tampering | Audit entries edited, deleted or reordered | SHA-256 hash chain plus a signature per entry; the ground keeps the last head it saw, which catches truncation | `auditLog.test.ts`, `auditTrail.test.ts` |
| Tampering | Altered radiation data or model file (cache, server, network) | SHA-256 manifest, strict schemas, size cap, strict UTF-8; failures are shown and the data is not used | `loader.test.ts`, `security.spec.ts` |
| Tampering | Batch altered in transit | Signature check; the batch is discarded | `PrivacyView.test.tsx` |
| Repudiation | "I never shared that" | Consent changes and transmissions are audit entries, signed and chained | `PrivacyView.test.tsx` |
| Information disclosure | Data read from storage at rest | Everything in the vault is encrypted; the E2E test reads IndexedDB and finds no plaintext | `security.spec.ts` |
| Information disclosure | Unlocked tablet left behind | Key only in memory; auto-lock after 5 idle minutes; reload locks | `useIdleLock.test.tsx`, `security.spec.ts` |
| Information disclosure | Oversharing to the ground | Nothing is shared by default; per-category, per-audience consent; notes stripped unless allowed | `outgoing.test.ts` |
| Information disclosure | Audit trail leaking content | Entries record that something happened, never the content | `CheckInView.test.tsx` |
| Information disclosure | Leaks through referrer, third parties or framing | No third-party requests; `Referrer-Policy: no-referrer`; `frame-ancestors 'none'`; COOP/COEP/CORP | `security.spec.ts` |
| Denial of service | Huge or malformed files freezing the app | 10 MB cap before parsing; schema validation | `loader.test.ts` |
| Denial of service | Model fails to load | Rules keep working and the screen says the model is not in use | `App.test.tsx` |
| Elevation of privilege | Script injection through text fields or the assistant | React escapes all text; no `innerHTML`; CSP without inline script or eval; Trusted Types enforced | `AssistantView.test.tsx`, `security.spec.ts` |
| Elevation of privilege | Prompt injection in the assistant | No language model: the question is only a search query; answers come from fixed passages | `assistant.test.ts` |
| Elevation of privilege | Malicious dependency | Exact versions and lockfile; install without lifecycle scripts; `npm audit`, OSV-Scanner, CodeQL; actions pinned by SHA; 7-day cooldown on updates | CI |

## Residual risks

- **Short PINs can be brute-forced offline** by someone who copies the storage: the lockout only
  protects the app, not a copied database. 600,000 PBKDF2 iterations slow this down; a 6-digit PIN
  is still a small space. A real deployment should use a longer passphrase or a hardware-backed key
  (WebAuthn with a platform authenticator).
- **PBKDF2 is not memory-hard.** Argon2id would resist GPU attacks better; WebCrypto does not offer
  it.
- **The ground public key is trusted on first use** in this prototype. A real system would enroll
  device keys before flight.
- **Light delay hides freshness.** The ground cannot tell a batch delayed by distance from one held
  back on purpose; the audit head in each batch limits how much can be hidden.
- **Simulated ground station.** It runs in the same browser to demonstrate the protocol.
