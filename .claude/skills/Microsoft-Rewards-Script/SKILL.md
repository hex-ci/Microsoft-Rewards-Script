```markdown
# Microsoft-Rewards-Script Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches you the development conventions and workflows used in the `Microsoft-Rewards-Script` TypeScript repository. You'll learn about file naming, import/export styles, commit patterns, and how to write and run tests in this codebase. This guide is ideal for contributors who want to maintain consistency and efficiency when working with the repository.

## Coding Conventions

### File Naming
- **Style:** PascalCase  
  Example:  
  ```
  MicrosoftRewardsScript.ts
  UserProfileManager.ts
  ```

### Import Style
- **Relative imports** are used throughout the codebase.  
  Example:  
  ```typescript
  import { getUserProfile } from './UserProfileManager';
  ```

### Export Style
- **Named exports** are preferred.  
  Example:  
  ```typescript
  // In UserProfileManager.ts
  export function getUserProfile(id: string) { ... }
  export const DEFAULT_PROFILE = { ... };
  ```

### Commit Patterns
- **Type:** Freeform, no strict prefixes
- **Average length:** 61 characters  
  Example:  
  ```
  Fix bug in daily reward calculation logic
  Add support for multiple user profiles
  ```

## Workflows

### Adding a New Feature
**Trigger:** When you want to introduce new functionality  
**Command:** `/add-feature`

1. Create a new TypeScript file using PascalCase (e.g., `NewFeature.ts`).
2. Use relative imports to include dependencies.
3. Export your functions or constants using named exports.
4. Write or update relevant tests in a corresponding `.test.ts` file.
5. Commit your changes with a clear, descriptive message.

### Fixing a Bug
**Trigger:** When you need to resolve a bug  
**Command:** `/fix-bug`

1. Locate the source of the bug in the relevant TypeScript file.
2. Apply the fix, maintaining coding conventions.
3. Update or add tests to cover the bug scenario.
4. Commit your fix with a descriptive message.

### Writing and Running Tests
**Trigger:** When adding new code or verifying existing functionality  
**Command:** `/run-tests`

1. Create or update test files following the `*.test.*` pattern (e.g., `UserProfileManager.test.ts`).
2. Write test cases for all new or changed logic.
3. Use the project's test runner (framework unknown; check project scripts or documentation).
4. Review test results and ensure all tests pass before committing.

## Testing Patterns

- **File Pattern:** Test files follow the `*.test.*` naming convention.
  Example:  
  ```
  MicrosoftRewardsScript.test.ts
  UserProfileManager.test.ts
  ```
- **Framework:** Not explicitly detected; check project scripts for details.
- **Best Practice:** Write tests for all new features and bug fixes. Place tests in files alongside or near the code they test.

## Commands
| Command      | Purpose                                      |
|--------------|----------------------------------------------|
| /add-feature | Start the workflow for adding a new feature  |
| /fix-bug     | Start the workflow for fixing a bug          |
| /run-tests   | Run the test suite                           |
```