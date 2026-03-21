---
description: How to restart the dev server cleanly when layout breaks or styles disappear
---

# Dev Server Restart

When the app layout breaks (sidebar goes flat/horizontal, styles disappear, broken CSS), it's a stale `.next` cache issue — **not a code bug**.

## Root Cause

Next.js dev server HMR cache corrupts during long-running sessions (especially 4+ hours with many file changes). The `.next` directory accumulates stale webpack chunks that stop serving CSS correctly.

## Fix

// turbo
1. Kill existing server and clear cache:
```bash
lsof -ti:3001 | xargs kill -9 2>/dev/null; sleep 1; cd /Users/sinohe/Antigravity/no-cap && rm -rf .next
```

// turbo
2. Restart the dev server:
```bash
cd /Users/sinohe/Antigravity/no-cap && npm run dev -- -p 3001
```

3. Hard refresh the browser (Cmd+Shift+R)

## Prevention

- Restart the dev server every few hours during active development
- After making significant file changes (new routes, CSS edits), if the UI looks broken, restart first before debugging
