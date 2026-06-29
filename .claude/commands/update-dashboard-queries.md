---
name: update-dashboard-queries
description: Workflow command scaffold for update-dashboard-queries in Microsoft-Rewards-Script.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /update-dashboard-queries

Use this workflow when working on **update-dashboard-queries** in `Microsoft-Rewards-Script`.

## Goal

Update the queries used for Bing search activities in response to dashboard changes.

## Common Files

- `src/functions/bing-search-activity-queries.json`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Edit src/functions/bing-search-activity-queries.json with new or updated queries.
- Commit the changes.

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.