---
name: Navigation Audit
description: Audit all pages for smooth navigation flow — back links, dependency guidance, and label consistency
---

# Navigation Audit Skill

Systematically audit every page in the application for navigation completeness and predictability.

## What This Checks

1. **Orphan pages** — Pages reachable via link but missing a back/return link
2. **Incorrect back-link targets** — Back links pointing to the wrong parent
3. **Inconsistent labels** — "Back to ___" text that doesn't match the sidebar/hub label
4. **`router.back()` usage** — Non-deterministic navigation (browser-history dependent)
5. **Missing dependency guidance** — Dead ends with no contextual links when data is missing
6. **Sidebar coverage** — Pages that exist but aren't in the sidebar and aren't linked from a hub

## Audit Steps

### 1. Map All Pages

```bash
# Find all pages
fd page.tsx src/app --extension tsx
fd layout.tsx src/app --extension tsx
```

Record the full list and group by section.

### 2. Review Sidebar Navigation

```bash
# Find the sidebar/nav component
fd "Sidebar\|Nav\|Layout" src/components --extension tsx
```

Compare sidebar links against the full page list. Identify pages not in the sidebar.

### 3. Check Each Page's Navigation

For every page, verify:

- **Has a back link?** Search for `href=` and `router.back` in the file
- **Back link points to correct parent?**
- **Back link label matches sidebar?**
- **Uses `<Link>` not `router.back()`?** Deterministic navigation is always preferred
- **Empty state has guidance?** When no data, does it link to the prerequisite step?

```bash
# Audit back links across all pages
rg "Back to" src/app --include="page.tsx" -n
rg "router.back" src/app --include="page.tsx" -n
```

### 4. Check for Orphan Pages

For pages not in the sidebar, search for inbound links:

```bash
# Example: check who links to a given path
rg 'href=.*/<path>' src/app --include="page.tsx" -n
```

If a page is reachable only from one other page, it MUST have a back link to that page.

### 5. Compile Findings

Create a findings table:

| # | Page | Issue | Severity | Fix |
|---|------|-------|----------|-----|

Severity levels:
- 🔴 **Critical** — Missing back link (user gets stuck)
- 🟡 **Medium** — Wrong target or `router.back()` usage
- 🟠 **Medium** — Inconsistent label
- 🔵 **Low** — Missing cross-navigation opportunity

### 6. Fix Issues

For each finding:
- Import `Link` from the framework's router and an arrow icon
- Add back link at the top of the return JSX, before the page header
- Use consistent styling matching the project's design system

### 7. Verify

```bash
npx tsc --noEmit
# or
npx next build
```

Ensure zero TypeScript errors after all changes.
