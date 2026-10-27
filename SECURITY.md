# Security policy

## Reporting a vulnerability

Please do not open a public issue. Use **Report a vulnerability** under the repository's
**Security** tab (GitHub private vulnerability reporting). It reaches the maintainers privately.

Include what you found, how to reproduce it, and what an attacker could do with it. A proof of
concept helps; please do not access data that is not yours or degrade the public demo.

We will confirm receipt within 3 working days and give a first assessment within 7.

## Scope

In scope: the web app in `apps/web`, the data pipeline in `data`, the model pipeline in `ml`, and the
deployed demo. The demo holds no real health data: every record you see is simulated, and anything
you type stays encrypted in your own browser.

The threat model, with the controls and the risks we accept, is in
[docs/threat-model.md](docs/threat-model.md).

## Supported versions

Only the latest commit on `main` receives fixes.
