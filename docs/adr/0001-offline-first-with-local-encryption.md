# 1. Offline first, with all health data encrypted on the device

Date: 2026-10-27. Status: accepted.

## Context

Beyond low Earth orbit the crew cannot count on the ground. A Mars link has 3 to 22 minutes of delay
each way and blackouts during solar conjunction. Health data is also the most sensitive data a
crew member has, and a cabin tablet is shared.

## Decision

The app runs entirely in the browser and works with no connection (service worker with a precached
build). Records are stored in IndexedDB encrypted with AES-GCM under a key derived from the
astronaut's PIN with PBKDF2 (600,000 iterations). The key exists only in memory while unlocked.
Data reaches the ground only as signed batches, and only the categories the astronaut allowed.

## Consequences

- No server to attack, run or pay for; the demo deploys as static files.
- A lost PIN means lost data. There is no recovery path, on purpose.
- PBKDF2 is what WebCrypto offers. It is not memory-hard; see the threat model.
- The ground station in the demo runs in the same browser to show the protocol.
