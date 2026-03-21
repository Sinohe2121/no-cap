---
name: CSS Audit
description: Audit all pages for design consistency — colors, buttons, forms, charts, spinners, and tooltips
---

# CSS Audit Skill

Systematically audit the entire application for CSS and design consistency issues.

## What This Checks

1. **Off-palette colors** — Hex codes used inline that aren't in `:root` design variables
2. **Chart color semantics** — Same data concept uses same color everywhere
3. **Button overrides** — Button classes shouldn't have inline `background` overrides
4. **Form input classes** — All inputs use standardized form classes from globals
5. **Spinner consistency** — All loading spinners use the same brand color
6. **Tooltip standardization** — All chart tooltips use same `borderRadius`, shadow, and font size
7. **Badge backgrounds** — Semantic badge backgrounds (success, error, warning) use consistent tints
8. **Card type mixing** — Don't mix card styles with different hover behaviors
9. **Duplicated constants** — Chart palettes and color arrays centralized in one place

## Audit Steps

### 1. Review Design System

```bash
# Find the CSS variable definitions (check globals, variables, or design tokens file)
fd "variables.css\|globals.css\|index.css" src/ --extension css
```

Record all `:root` color variables. This is the source of truth.

### 2. Find Off-Palette Colors

```bash
# Find all hex colors used inline in components/pages
rg '#[0-9a-fA-F]{6}' src/ --include="*.tsx" -n -o | sort | uniq -c | sort -rn
```

Cross-reference every unique hex against `:root` variables. Flag any that aren't defined.

### 3. Audit Chart Colors

```bash
# Find all chart fill/stroke colors
rg 'fill=|stroke=' src/ --include="*.tsx" -n
rg 'COLORS|PALETTE' src/ --include="*.ts" --include="*.tsx" -n
```

Build a color-to-concept map and verify consistency across ALL charts.

### 4. Audit Buttons

```bash
# Find all button class usage
rg 'btn-|Button' src/ --include="*.tsx" -n

# Find inline style overrides on buttons
rg "btn.*style.*background" src/ --include="*.tsx" -n
```

Flag any button components with inline `background` overrides.

### 5. Audit Form Inputs

```bash
# Find input class patterns
rg 'className.*input|className.*form-' src/ --include="*.tsx" -n
```

Verify all inputs use standardized classes from the design system.

### 6. Audit Spinners

```bash
rg 'animate-spin|spinner|loading' src/ --include="*.tsx" -n
```

Verify all spinners use the same brand color.

### 7. Audit Tooltips

```bash
rg 'borderRadius|contentStyle|TOOLTIP' src/ --include="*.tsx" -n
```

Verify all tooltip styles are consistent.

### 8. Compile Findings

Create a findings table:

| # | Category | File | Issue | Severity | Fix |
|---|----------|------|-------|----------|-----|

Severity levels:
- 🔴 **High** — Causes visual inconsistency users will notice
- 🟡 **Medium** — Design system violation
- 🟠 **Low** — Cleanup for maintainability
