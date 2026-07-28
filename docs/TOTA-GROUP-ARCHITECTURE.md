# Tota Group Architecture — Build 8.0

## Product family

- **TotaVivo Life Companion** — daily-life, accessibility, communication, medication organization, safety helpers, money organization, smart-home access, family/caregiver support, and optional rewards.
- **TotaSignal** — trading and market intelligence, isolated as its own module and data boundary.
- **Future Tota modules** — optional protection, coverage, assistance, and support services registered through the Tota Group shell.

## Design decisions

1. Tota Group is the umbrella navigation and identity layer.
2. TotaVivo becomes **TotaVivo Life Companion**, not the umbrella for unrelated modules.
3. TotaSignal remains technically and legally separate from health, family, and safety information.
4. Every module has its own storage namespace, permissions, disclaimers, and release version.
5. Safety and medical helpers must always state whether they are demonstrations, browser-dependent tests, or connected production services.

## Current package structure

- `/index.html` — Tota Group module launcher.
- `/apps/totavivo/life-companion.html` — current complete TotaVivo application promoted to Life Companion.
- `/apps/totavivo/welcome.html` — public TotaVivo marketing page.
- `/apps/totasignal/` — reserved TotaSignal integration boundary.
- `/docs/` — review, architecture, and migration notes.

## Next engineering phase

The current TotaVivo application contains hundreds of functions in one HTML file. Build 8 preserves the working feature set first. The next controlled refactor should split it into `app-shell`, `state`, `accessibility`, `communications`, `medications`, `safety`, `finance-organizer`, `smart-home`, `caregiver`, and `rewards` modules with automated smoke tests before each extraction.
