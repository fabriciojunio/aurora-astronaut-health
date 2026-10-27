# 3. Strict CSP with Trusted Types, tested against the production build

Date: 2026-10-27. Status: accepted.

## Context

The app decrypts health records in the page. Script injection would expose everything, so the page
must refuse any script it did not ship.

## Decision

Serve a CSP with `default-src 'none'`, no inline script, no eval, and Trusted Types enforced, plus
HSTS, COOP/COEP/CORP, `no-referrer` and a restrictive Permissions-Policy. `vercel.json` is the
single source; `vite preview` reads it, so the Playwright tests run under the same headers as
production and fail on any console error or CSP violation.

## Consequences

- Registering the service worker is a Trusted Types sink, so it goes through a policy that can only
  return `/sw.js`.
- Zod probes `new Function` at startup to speed up validation. Under this CSP that probe is a
  violation, so Zod runs in jitless mode, configured before any schema is created.
- A new dependency that needs eval or inline styles from HTML will fail the end-to-end tests
  instead of weakening the policy.
