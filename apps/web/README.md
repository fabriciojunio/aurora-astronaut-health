# AURORA web app

The crew-facing app. See the [project README](../../README.md) for what it does and why.

```bash
npm ci
npm run dev            # development server
npm run build          # production build in dist/, including sw.js
npm run preview        # serves dist/ with the production security headers
```

```bash
npm run lint
npm run typecheck      # app, build scripts and end-to-end tests
npm test
npm run test:coverage
npm run test:e2e       # builds, serves and runs Playwright in Chromium
```

| Folder | Contents |
|---|---|
| `src/domain` | Rules with no framework code: vitals and NEWS2, baselines, radiation, sleep, PVT, consent, procedures, evidence |
| `src/ai` | Isolation Forest scoring, per-day anomaly monitor, Theil-Sen forecast, BM25 assistant |
| `src/security`, `src/storage` | WebCrypto helpers, encrypted vault, signed audit trail |
| `src/sync` | Signed batches to the ground, consent filtering, idempotent apply |
| `src/data` | Loader that checks SHA-256 and schema before using any snapshot |
| `src/sim` | Simulated crew and scenarios (seeded, reproducible) |
| `src/ui` | React screens |
| `e2e` | Playwright tests against the production build |
| `scripts` | Training-data export and the service worker build step |
