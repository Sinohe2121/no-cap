---
name: Performance Audit
description: Audit the codebase for performance bottlenecks — missing DB indexes, sequential queries, O(n²) loops, and frontend loading patterns — then apply fixes
---

# Performance Audit

Systematically audit and optimize the web application for faster load times. This covers four layers: database, API routes, frontend loading, and caching.

## Audit Steps

### 1. Database Index Audit

**Goal:** Find columns that are filtered, sorted, or joined on but lack indexes.

1. Open `prisma/schema.prisma` and list every `@@index` and `@@unique` directive.
2. Search all API routes for Prisma `where`, `orderBy`, and `include` clauses:
   ```
   grep -rn "where:\|orderBy:\|findMany\|findFirst" src/app/api/ --include="*.ts"
   ```
3. Cross-reference: any column used in `where` filters (especially date ranges, foreign keys, status fields) that does NOT have an `@@index` is a **missing index**.
4. Add `@@index([columnName])` directives to the schema.
5. Deploy with `npx prisma db push` (or create a migration with `npx prisma migrate dev --name add_perf_indexes`).

**Common misses:**
- Date columns used in range filters (`resolutionDate`, `createdAt`, `payDate`)
- Enum/status columns used in `where` filters (`issueType`, `entryType`, `status`)
- Amount columns filtered with `gt: 0` or similar (`capitalizedAmount`)

---

### 2. API Route Audit

**Goal:** Eliminate sequential query waterfalls and O(n²) algorithmic patterns.

#### 2a. Sequential Query Detection

1. Search for routes with multiple `await prisma.` calls:
   ```
   grep -c "await prisma\." src/app/api/**/route.ts
   ```
2. For each route with 3+ sequential awaits, check if any query depends on a previous query's result.
3. **Independent queries** → wrap in `Promise.all()`:
   ```typescript
   // BEFORE (sequential — ~600ms)
   const projects = await prisma.project.findMany();
   const developers = await prisma.developer.findMany();
   const tickets = await prisma.jiraTicket.findMany();

   // AFTER (parallel — ~200ms)
   const [projects, developers, tickets] = await Promise.all([
       prisma.project.findMany(),
       prisma.developer.findMany(),
       prisma.jiraTicket.findMany(),
   ]);
   ```

#### 2b. O(n²) Loop Detection

1. Search for `.filter()` or `.find()` calls inside `for` loops:
   ```
   grep -n "\.filter\|\.find" src/app/api/**/route.ts
   ```
2. If a filter scans an entire array on every iteration (e.g., filtering all tickets per developer per payroll import), replace with a **pre-grouped Map**:
   ```typescript
   // BEFORE — O(devs × tickets) per payroll import
   const devTickets = allTickets.filter(t => t.assigneeId === dev.id);

   // AFTER — O(1) lookup
   const ticketsByDev = new Map<string, Ticket[]>();
   for (const t of allTickets) {
       const arr = ticketsByDev.get(t.assigneeId!) || [];
       arr.push(t);
       ticketsByDev.set(t.assigneeId!, arr);
   }
   // Then: ticketsByDev.get(dev.id) || []
   ```

#### 2c. Duplicate Query Detection

1. Check if the same table is queried multiple times in one route (e.g., `prisma.accountingPeriod.findMany()` called twice).
2. Consolidate into a single query and reuse the result.

#### 2d. Over-fetching Detection

1. Check for `findMany()` without `select` — these fetch all columns.
2. If only certain fields are needed, add a `select` clause.
3. Check for JS-side date filtering that could be pushed into the Prisma `where` clause.

---

### 3. Frontend Loading Audit

**Goal:** Reduce perceived load time and eliminate redundant fetches.

1. Search for pages with multiple `fetch()` calls:
   ```
   grep -n "fetch(" src/app/**/page.tsx
   ```
2. Ensure parallel fetches use `Promise.all()`, not sequential `await`.
3. Check for **redundant fetches** — the same endpoint called from multiple components on one page.
4. Check for **missing loading states** — full-page spinners should be replaced with skeleton placeholders that show the page structure immediately.

---

### 4. Response Caching Audit

**Goal:** Prevent redundant DB hits for data that changes infrequently.

1. For read-only GET endpoints that return computed/aggregated data:
   - Add `Cache-Control: s-maxage=30, stale-while-revalidate=60` headers
   - This lets repeat page visits within 30s serve cached data
2. For endpoints serving config/settings data (e.g., logo, fringe rate):
   - Consider longer TTL: `s-maxage=300`

---

## Verification

After applying optimizations:

1. **Build check:** `npx next build` must pass with exit code 0.
2. **Timing comparison:** Use `curl -w '%{time_total}\n'` on the heaviest endpoints before and after.
3. **Functional check:** Refresh the dashboard and verify all data still renders correctly.
4. **Restart dev server:** Clear `.next` cache and restart to ensure no stale module issues:
   ```bash
   rm -rf .next && npm run dev -- -p 3001
   ```

## Priority Order

Always apply optimizations in this order (highest impact first):

1. **Database indexes** — lowest effort, highest impact
2. **`Promise.all` parallelization** — low effort, high impact
3. **Map-based grouping** — low effort, medium impact
4. **Push filters to DB** — low effort, medium impact
5. **Skeleton loaders** — medium effort, medium impact (perceived perf)
6. **Cache headers** — low effort, low-medium impact
