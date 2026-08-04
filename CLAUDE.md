# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Microsoft Rewards automation bot in TypeScript. Uses patchright (patched Playwright fork) to log into Microsoft/Bing, fetch Rewards dashboards/APIs, complete daily activities, and run Bing searches for configured accounts. V3.x may not fully support the new Bing Rewards interface — `Login.getRewardsSession()` detects the modern dashboard and disables request-token use for that session.

## Commands

```bash
npm run pre-build    # install deps, clear dist, install patchright Chromium
npm run build        # rimraf dist && tsc && node scripts/main/copyAssets.js
npm run start        # run compiled output (node ./dist/index.js)
npm run dev          # ts-node ./src/index.ts -dev (debug logging)
npm run format       # prettier --write .
npm run format:check # prettier --check . (CI gate)
npm run lint         # eslint . (whole repo)
npm run lint:fix     # eslint . --fix
```

**No test runner exists.** There is no `npm test` script, no test framework installed. The only local verification commands are `npm run build`, `npm run format:check`, and `npm run lint`. Do not assume `npm test` works.

## Code Style (deviates from defaults — Claude must follow these)

- **Prettier**: 4-space indent, single quotes, **no semicolons**, **no trailing commas**, print width 120, LF endings, `arrowParens: avoid`. (Defaults are 2 spaces, semicolons on, trailing commas `all`, width 80, arrow parens `always` — do not use defaults.)
- **ESLint**: `eslint:recommended` + `@typescript-eslint/recommended`, `prefer-arrow-callback` error, `@typescript-eslint/no-explicit-any` warn. Flat config in `eslint.config.mjs`. Ignores `dist/`, `scripts/`, `packaging/`.
- **TypeScript**: strict mode plus `noUnusedLocals`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUncheckedIndexedAccess`, `noImplicitOverride`. Target ES2022, module CommonJS, output `dist/`.

## Runtime Configuration

- **Node.js `>=24.0.0`** required, enforced at startup by `checkNodeVersion()` in `src/util/Validator.ts`.
- **Accounts load from environment variables, not a JSON file.** `loadAccounts()` in `src/util/Load.ts` reads `ACCOUNT_<n>_EMAIL`, `ACCOUNT_<n>_PASSWORD`, plus optional `_TOTP_SECRET`, `_RECOVERY_EMAIL`, `_GEO_LOCALE`, `_LANG_CODE`, proxy fields, and `_SAVE_FINGERPRINT_MOBILE/DESKTOP`. Index starts at 1; a missing `PASSWORD` when `EMAIL` exists is a hard error. A `.env` file is auto-loaded (custom parser, not dotenv) if found. See `env.example` for the full list.
- **`config.json` search order** (`resolveProjectFile()`): cwd → project root → `dist/` → `src/`. Template is `config.example.json` at project root; copy to `config.json` and rebuild after changes.
- `-dev` only enables debug-level logging (`process.argv.includes('-dev')` in `Logger.ts`); it does **not** change which accounts or config are loaded.
- **Sessions persist in SQLite** (`sessions.db`, WAL mode) at `<cwd>/<config.sessionPath>/` (default `sessions`). Built-in `node:sqlite`, not a third-party package. Rows keyed by `(email, platform)` where platform is `mobile` or `desktop`. `closeSessionStore()` checkpoints WAL on shutdown.
- Docker writes `config.json` into `dist/config/` and symlinks it into `dist/`. `CONFIG_*` env vars override config on each container start; Docker forces headless mode.

## Architecture Notes

- **`src/` compiles to CommonJS; `scripts/` is ESM** (`scripts/package.json` has `"type": "module"`). Don't mix import styles across these boundaries.
- **Build copies JSON assets**: `scripts/main/copyAssets.js` copies `search-queries.json` and `bing-search-activity-queries.json` from `src/functions/` to `dist/functions/`. Build fails if these are missing.
- **AsyncLocalStorage** (`src/index.ts`) carries `{ isMobile, account }` through async chains. Use `bot.isMobile`/`getCurrentContext()` rather than passing device mode as a parameter.
- When `config.clusters > 1`, the primary process forks Node `cluster` workers; accounts are chunked and distributed; workers send stats/logs back via IPC; webhook queues flush before exit.
- Keep `src/interface/*.ts`, the Zod schemas in `src/util/Validator.ts`, and `config.example.json` / `env.example` in sync when adding or changing configuration fields.

## Docker

Multi-stage Node 24 build. Runtime forces `FORCE_HEADLESS=1` and installs only the Chromium headless shell. Entrypoint handles timezone, account/config generation from env vars, config drift detection, cron setup (`CRON_SCHEDULE`, `TZ`), and optional API mode (`API_MODE=true` requires `API_TOKEN`). `compose.override.yaml` overrides the image to the fork's registry (`ghcr.io/hex-ci/...`) vs upstream (`ghcr.io/thenetsky/...`) in `compose.yaml`.
