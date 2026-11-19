# AGENTS.md

Guidance for coding agents working in this repository.

## Project Overview

Microsoft Rewards automation bot in TypeScript. Uses patchright (patched Playwright fork) to log into Microsoft/Bing, read the Rewards dashboards, complete activities, and run Bing searches for configured accounts.

This branch tracks upstream **v5**, a full rewrite into layered modules (see `src/` layout below). The v4 tree is unrelated: file paths, config shape and session storage all changed.

## Commands

```bash
npm run pre-build     # npm ci + install patchright Chromium
npm run build         # rimraf dist && tsc && node scripts/main/copyAssets.js
npm run start         # node ./dist/index.js
npm run dev           # ts-node ./src/index.ts -dev (debug logging)
npm run check         # build + check:api + lint + format:check
npm run lint          # eslint .
npm run format        # prettier --write .
npm run format:check  # prettier --check .
```

**No test runner exists.** There is no `npm test`, no test framework. Local verification is `npm run build`, `npm run check:api`, `npm run lint`, `npm run format:check`.

Node.js `>=24.0.0`, enforced by `checkNodeVersion()` in `src/config/Validator.ts`.

## Code Style

- **Prettier**: 4-space indent, single quotes, **no semicolons**, **no trailing commas**, print width 120, LF, `arrowParens: avoid`.
- **ESLint**: flat config in `eslint.config.mjs` — `@eslint/js` + `typescript-eslint` recommended, `prefer-arrow-callback` error, `@typescript-eslint/no-explicit-any` warn. Ignores `dist/`, `node_modules/`, `diagnostics/`, `sessions/`.
- **TypeScript**: strict plus `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noEmitOnError`. Target ES2022, CommonJS, output `dist/`. `tsconfig.control-api.json` type-checks the JS control API separately.

## Runtime Configuration

- **Accounts load from environment variables**, not a JSON file: `ACCOUNT_<n>_EMAIL`, `_PASSWORD`, `_TOTP_SECRET`, `_RECOVERY_EMAIL`, `_GEO_LOCALE`, `_LANG_CODE`, proxy fields, `_SAVE_FINGERPRINT_MOBILE/DESKTOP`. Parsed by `loadAccountSettings()` in `scripts/lib/env.js`. A `.env` file loads automatically.
- **`config.json`** is validated by the Zod schema in `src/config/Validator.ts`; defaults in `src/config/Defaults.ts`; `CONFIG_*` env overrides in `src/config/ConfigEnvOverrides.ts`. Search order is project root → `dist/` → `src/`.
- `-dev` only raises the log level; it does not change which accounts or config are loaded.
- **Sessions persist in SQLite** (`sessions.db`, WAL) under `<cwd>/<config.sessionPath>/`, via built-in `node:sqlite`. Rows keyed by `(email, platform)`.
- Changing a config field means touching `src/config/Config.ts`, `src/config/Defaults.ts`, the Zod schema, and `config.example.json` together.

## Architecture

`src/` is layered; imports flow downward only.

- `constants/` — URL and search-feed constants.
- `config/` — config loading, Zod validation, env overrides, execution plan.
- `core/` — `BotContext` (all runtime state), `RunCoordinator` (account loop, clustering), `AccountRunner`, `createBot`.
- `browser/` — patchright lifecycle: `BrowserManager`, `BrowserSessions`, `auth/` (selector-driven login state machine), `RewardsBrowserContext` (cookie sync between source and task contexts), `BrowserRequestClient` (in-page fetch with node fallback).
- `network/` — `HttpClient` (impit), cookie and header helpers.
- `session/` — SQLite session store and cookie filtering.
- `logging/` — console/webhook loggers, Discord/Telegram/ntfy senders.
- `rewards/` — the domain layer:
    - `shared/` — mode-agnostic logic: promotions, eligibility, point accounting, parsers, query engine, search manager.
    - `api/` — `rewardsMode: "api"`: direct dapi/server-action calls, `ApiWorkflow`.
    - `browser/` — `rewardsMode: "browser"`: rendered cards, `BrowserWorkflow`, `BrowserTaskRunner`.
    - `app/` — Bing app (SAAndroid/SAIOS) dashboard and activities.
- `control-api/` — plain JS HTTP server, type-checked by `tsconfig.control-api.json`.

`rewardsMode` selects the transport; `createBot()` picks `ApiRewardsBot` or `BrowserRewardsBot`, and `bot.mode` exposes the per-mode action set (`ModeServices`).

## Fork additions (not upstream)

These are deliberate deltas on top of upstream v5. Keep them when merging upstream.

- `src/rewards/shared/data/RewardsSessionTicket.ts` — the `tifacfaatcs` cookie is required by `rewards.bing.com/api/getuserinfo`; without it the primary endpoint only returns a sign-in placeholder and the dashboard degrades to the Bing flyout. Called once from `AccountData.getDashboardData()`.
- `src/rewards/app/actions/OtherPromotions.ts` — completes SAIOS `options=612` `urlreward` promotions that the app dashboard omits. Gated by `workers.doOtherPromotions`.
- `ServerActions.bootstrap()` warns instead of throwing when `section#dailyset` is absent: browser mode reads tasks from the flyout and does not need it.
- `BING` points at `cn.bing.com`; `cn.bing.com` is whitelisted wherever Bing hosts are matched.

## Docker

Multi-stage Node 24 build. Runtime forces headless and installs only the Chromium headless shell. The entrypoint handles timezone, config generation from defaults, drift detection, cron setup (`CRON_SCHEDULE`, `TZ`) and optional API mode (`API_MODE=true` requires `API_TOKEN`). `compose.override.yaml` points the image at the fork registry (`ghcr.io/hex-ci/...`).
