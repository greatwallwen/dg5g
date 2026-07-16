# Repository Guidelines

## Project Structure & Module Organization

This pnpm workspace powers the DGBook 5G network-optimization digital textbook. `apps/web/` is the only product runtime and contains the student, teacher, projector, classroom-follow, and capability-map surfaces. Shared runtime code lives in `packages/animation/`, `packages/widgets/`, `packages/edugame-core/`, `packages/edugame-assets/`, and `packages/shared/`.

The authoritative textbook source is `content/5g/5g.docx`; update `scripts/import-5g-docx.py` before regenerating derived content. Generated P1 runtime content is in `textbook/5g/generated/`. Authoring media remains under `site/public/media/`, while the deployed application reads only the verified closure in `apps/web/public/media/`.

## Build, Test, and Development Commands

- `pnpm dev`: run the Next.js platform locally.
- `pnpm build`: build the production platform.
- `pnpm typecheck`: type-check the web application.
- `pnpm web:test:unit`: run the application unit suite.
- `pnpm web:check-structure`: enforce application boundaries.
- `pnpm qa:gates`: run the complete local product gate.
- `pnpm deploy:web:source`: create the verified source release archive.
- `python scripts/import-5g-docx.py`: regenerate textbook-derived content when its authoritative source changes.

Use Node `20.20.2` and pnpm `9.15.0` for reproducible builds.

## Coding Style & Naming Conventions

Use TypeScript, ESM, React function components, and 2-space indentation. Component files use `PascalCase`; utilities and variables use `camelCase`. Keep route files focused on authorization and data assembly; place product logic in `src/features/` or `src/platform/`. Prefer generated content and shared snapshot projections over per-screen hardcoded copies.

## Testing Guidelines

For product changes, run unit tests, typecheck, structure checks, production build, and the affected browser audit. P1 acceptance must keep one teacher and exactly three demo students, all three P1 tasks, twelve nodes, three distinct N02 lessons, three N04 professional outputs, the project portfolio, classroom follow isolation, and the shared capability state consistent across student, teacher, projector, and graph surfaces.

## Agent-Specific Instructions

Do not edit generated build output by hand. Do not bypass SQLite authority with browser state or duplicated mock statistics. Keep the textbook one-way: no student dialogue, discussion panel, roundtable flow, or Q&A tutor entry. Keep pure animation artifacts free of playback controls, presenters, and TTS configuration. Treat `.git/`, databases, authoritative content, verified media, and current/previous/final evidence as protected until their dedicated reversible-quarantine step.
