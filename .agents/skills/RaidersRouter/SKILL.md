```markdown
# RaidersRouter Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches the core development patterns and conventions used in the RaidersRouter TypeScript codebase. It covers file organization, code style, commit message conventions, and testing practices. By following these patterns, contributors can maintain consistency and quality throughout the project.

## Coding Conventions

### File Naming
- Use **camelCase** for file names.
  - Example: `raidersRouter.ts`, `routeHandler.ts`

### Import Style
- Mixed import styles are used, both named and default imports may appear.
  - Example:
    ```typescript
    import { Router } from './routerCore'
    import utils from './utils'
    ```

### Export Style
- Prefer **named exports**.
  - Example:
    ```typescript
    export function createRoute() { ... }
    export const ROUTER_VERSION = '1.0.0'
    ```

### Commit Messages
- Follow **Conventional Commits**.
- Use prefixes like `feat` for features and `docs` for documentation.
  - Example:
    ```
    feat: add support for dynamic route parameters
    docs: update README with usage examples
    ```

## Workflows

### Commit New Feature
**Trigger:** When adding a new feature or capability  
**Command:** `/commit-feature`

1. Implement the new feature in a camelCase-named file.
2. Use named exports for all new functions or constants.
3. Write a commit message starting with `feat:`, describing the feature.
4. Example commit message:
    ```
    feat: implement middleware chaining for routes
    ```

### Update Documentation
**Trigger:** When updating or adding documentation  
**Command:** `/commit-docs`

1. Edit or create documentation files as needed.
2. Write a commit message starting with `docs:`, summarizing the change.
3. Example commit message:
    ```
    docs: add API usage section to README
    ```

### Run Tests
**Trigger:** Before pushing changes or after implementing new code  
**Command:** `/run-tests`

1. Ensure all test files follow the `*.test.ts` naming pattern.
2. Run tests using Vitest:
    ```
    npx vitest run
    ```
3. Review test output and fix any failing tests.

## Testing Patterns

- Tests are written in TypeScript using the **Vitest** framework.
- Test files are named with the `.test.ts` suffix.
  - Example: `routerCore.test.ts`
- Example test structure:
    ```typescript
    import { describe, it, expect } from 'vitest'
    import { createRoute } from './raidersRouter'

    describe('createRoute', () => {
      it('should create a route with the correct path', () => {
        const route = createRoute('/home')
        expect(route.path).toBe('/home')
      })
    })
    ```

## Commands
| Command         | Purpose                                      |
|-----------------|----------------------------------------------|
| /commit-feature | Commit a new feature with proper conventions |
| /commit-docs    | Commit documentation updates                 |
| /run-tests      | Run the test suite with Vitest               |
```
