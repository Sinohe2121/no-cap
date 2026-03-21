---
description: Comprehensive codebase security, bug, and refactoring audit for the no-cap application
---

# Codebase Audit Workflow

Run this check to perform a full security, bug, and refactoring audit of the no-cap codebase. This workflow performs iterative passes until no new findings emerge.

## How to Invoke

Tell the agent: `/audit-check` or "run the codebase audit"

## Audit Process

### Pass 1 — Security Scan

1. **Auth boundary check** — Read `src/middleware.ts` and verify the matcher regex covers all routes correctly. Check for routes excluded from auth that shouldn't be.

2. **RBAC enforcement** — Search all `route.ts` files for `requireAuth` and `requireAdmin` usage. Flag any write route (`POST`, `PUT`, `PATCH`, `DELETE`) that doesn't call one of these helpers.
```bash
# Find routes WITHOUT requireAuth/requireAdmin
grep -rL "requireAuth\|requireAdmin" src/app/api/**/route.ts
```

3. **Mass assignment** — Search for patterns where `req.json()` is passed directly to Prisma `create`/`update` without field whitelisting:
```bash
grep -n "prisma\.\w\+\.\(create\|update\)" src/app/api/**/route.ts | grep -v "data: {"
```

4. **Error message leaks** — Find routes returning `err.message`, `String(e)`, or `error.message` in responses:
```bash
grep -rn "err\.message\|String(e)\|error\.message" src/app/api/**/route.ts
```

5. **Secrets in code** — Check for hardcoded credentials, API keys, or tokens:
```bash
grep -rn "password\|secret\|token\|apiKey" src/app/api/**/route.ts --include="*.ts" | grep -v "import\|interface\|type\|//\|process\.env"
```

6. **Security headers** — Check `middleware.ts` and `next.config.js` for CSP, X-Frame-Options, etc.

7. **Rate limiting** — Check if any rate limiting middleware or logic exists.

8. **Input validation** — Check if Zod or similar validation is used:
```bash
grep -rn "import.*zod\|z\.object\|z\.string" src/ --include="*.ts" --include="*.tsx"
```

9. **CSV injection** — Check CSV export for formula injection prevention (values starting with `=`, `+`, `-`, `@`).

10. **Credential storage** — Check if API tokens (Jira, GitHub, BambooHR) are stored encrypted or plaintext in the database.

### Pass 2 — Bug Scan

1. **TypeScript null safety** — Run the TypeScript compiler to find all current type errors:
```bash
npx tsc --noEmit 2>&1 | head -100
```

2. **`as any` casts** — Find all `as any` casts that suppress type checking:
```bash
grep -rn "as any" src/ --include="*.ts" --include="*.tsx"
```

3. **Cost logic consistency** — Search for all places the salary+fringe+SBC formula is computed. Each should use the same shared function:
```bash
grep -rn "salary.*fringe.*sbc\|grossSalary.*fringe\|loadedCost.*monthlySalary" src/ --include="*.ts"
```

4. **Idempotency** — Check all `POST` routes that create database records. Verify they handle duplicate calls gracefully (upsert, idempotency keys, or guard checks).

5. **Race conditions** — Check `useEffect` hooks in page components for missing `AbortController` patterns:
```bash
grep -A5 "useEffect" src/app/**/page.tsx | grep -B5 "fetch("
```

6. **Missing error boundaries** — Check if React error boundaries exist for page-level error handling.

7. **Unbounded queries** — Find `findMany` calls without `take` or pagination:
```bash
grep -n "findMany" src/app/api/**/route.ts | grep -v "take\|skip\|cursor"
```

### Pass 3 — Refactoring Scan

1. **Code duplication** — Search for identical or near-identical patterns across multiple files:
```bash
# Check for duplicated cost computation pattern
grep -rn "salary + fringe + sbc" src/app/api/ --include="*.ts"
```

2. **Magic strings** — Check for hardcoded strings that should use constants from `lib/constants.ts`:
```bash
grep -rn "'CAPITALIZATION'\|'EXPENSE'\|'AMORTIZATION'\|'STORY'\|'BUG'" src/app/api/ --include="*.ts" | grep -v "constants"
```

3. **Missing constants** — Compare values used across routes against `lib/constants.ts` exports.

4. **Inconsistent error handling** — Check if error response shapes are consistent across routes.

5. **Test coverage** — Check for existence of test files:
```bash
find src/ -name "*.test.ts" -o -name "*.test.tsx" -o -name "*.spec.ts"
```

6. **Component file structure** — Verify one component per file and proper CSS module usage.

7. **Dead code** — Look for unused imports, unused functions, and commented-out code blocks.

## Iterative Convergence

After completing passes 1-3:
1. Compile all findings into an `audit_findings.md` artifact
2. Re-read the findings list
3. For each finding, check if it reveals adjacent issues (e.g., if RBAC is missing on one route, check ALL routes)
4. Add any new findings
5. Repeat step 2-4 until no new findings emerge

## Output Format

Create/update `audit_findings.md` artifact with:
- Findings organized by severity: 🔴 Critical, 🟠 High, 🟡 Medium, 🟢 Low
- Each finding has: ID, description, file location, risk/impact, and recommended fix
- Summary table with counts by category and severity
- Priority-ordered remediation plan

## Previous Findings Reference

Check the most recent `audit_findings.md` to compare against and verify which items have been resolved since the last audit.
