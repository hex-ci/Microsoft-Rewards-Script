---
name: verify
description: Run the project's only verification commands (build, format check, lint) since there is no test runner. Use after making code changes to confirm they are safe.
---

# Verify changes

This repo has **no test runner**. The only way to verify code changes is the build + format check + lint trio.

## Steps

1. Run `npm run build` — compiles TypeScript (fails on type errors) and copies JSON assets to `dist/`.
2. Run `npm run format:check` — Prettier check; fails if any file is not formatted per `.prettierrc` (4 spaces, no semicolons, no trailing commas, single quotes, print width 120, `arrowParens: avoid`).
3. Run `npm run lint` — ESLint over the whole repo (`eslint .`).

All three must pass before considering work complete. If any fails, fix the reported issues and re-run the failing command. Do not skip a failing step.

## Notes

- `npm run lint:fix` and `npm run format` can auto-fix most formatting/lint issues, but re-run `format:check` and `lint` afterward to confirm.
- The build step clears `dist/` first (`rimraf dist`), so always build before running `npm start`.
