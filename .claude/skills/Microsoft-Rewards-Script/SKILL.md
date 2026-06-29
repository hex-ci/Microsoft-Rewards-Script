```markdown
# Microsoft-Rewards-Script Development Patterns

> Auto-generated skill from repository analysis

## Overview

This skill teaches you the core development patterns and workflows used in the `Microsoft-Rewards-Script` TypeScript project. You'll learn the project's coding conventions, how to update Bing search queries, manage releases, and maintain documentation/configuration. The guide also covers testing patterns and provides handy commands for common tasks.

## Coding Conventions

- **Language:** TypeScript
- **Framework:** None detected
- **File Naming:** PascalCase is used for file names.
  - Example: `BingSearchActivity.ts`
- **Import Style:** Relative imports.
  - Example:
    ```typescript
    import { getQueries } from './functions/BingSearchActivity';
    ```
- **Export Style:** Named exports.
  - Example:
    ```typescript
    export function getQueries() { ... }
    ```
- **Commit Messages:** Freeform, usually around 39 characters. No strict prefixing.

## Workflows

### Update Dashboard Queries
**Trigger:** When Microsoft updates the dashboard or search activity requirements, requiring new or modified queries.  
**Command:** `/update-queries`

1. Edit `src/functions/bing-search-activity-queries.json` to add, remove, or update Bing search queries as needed.
2. Commit your changes with a descriptive message.

**Example:**
```json
[
  "latest tech news",
  "weather today",
  "how to cook pasta"
]
```

### Version Bump and Release
**Trigger:** When preparing a new release or hotfix, especially after significant changes or to fix release issues.  
**Command:** `/bump-version`

1. Update the `version` field in `package.json`.
2. Regenerate or update `package-lock.json` (e.g., by running `npm install`).
3. Commit both `package.json` and `package-lock.json` with a message like "Bump version to x.y.z".

**Example:**
```json
// package.json
{
  "version": "1.2.3"
}
```

### Documentation and Config Update
**Trigger:** When features are added, workflows change, or deployment instructions/configs need clarification.  
**Command:** `/update-docs`

1. Edit `README.md` to clarify usage or update instructions.
2. Edit `config.example.json` or `compose.yaml` as needed to reflect new configuration or deployment options.
3. Commit the changes with a clear message.

**Example:**
```json
// config.example.json
{
  "account": "your-email@example.com",
  "password": "your-password"
}
```

## Testing Patterns

- **Test Files:** Use the `*.test.*` pattern (e.g., `BingSearchActivity.test.ts`).
- **Framework:** Not explicitly detected; likely uses a standard TypeScript-compatible test runner (e.g., Jest or Mocha).
- **Example Test File:**
  ```typescript
  import { getQueries } from './BingSearchActivity';

  test('returns default queries', () => {
    expect(getQueries()).toContain('weather today');
  });
  ```

## Commands

| Command         | Purpose                                                      |
|-----------------|--------------------------------------------------------------|
| /update-queries | Update Bing search activity queries after dashboard changes   |
| /bump-version   | Bump package version and update lockfile for a new release   |
| /update-docs    | Update documentation and configuration files                 |
```
