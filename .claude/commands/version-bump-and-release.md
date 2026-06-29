---
name: version-bump-and-release
description: Workflow command scaffold for version-bump-and-release in Microsoft-Rewards-Script.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /version-bump-and-release

Use this workflow when working on **version-bump-and-release** in `Microsoft-Rewards-Script`.

## Goal

Bump the package version and update lockfile to release a new version.

## Common Files

- `package.json`
- `package-lock.json`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Update version in package.json.
- Regenerate or update package-lock.json.
- Commit both files.

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.