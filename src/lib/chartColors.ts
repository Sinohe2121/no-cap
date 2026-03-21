/**
 * Centralized chart color constants — import from here instead of defining per-page.
 *
 * Semantic mapping:
 *   Gem (#4141A2)     → CAPEX / Capitalized / Features
 *   Red (#FA4338)     → OPEX / Expensed / Bugs
 *   Cilantro (#21944E) → Success / Headcount / Positive
 *   Amber (#F5A623)   → Warnings / Epics / Net Asset
 *   Slate (#7FA8C8)   → Tasks (neutral)
 *   Gem-20 (#9494F0)  → Subtasks (light accent)
 */

// ── Pie / Donut ────────────────────────────────────────────────
/** Features (Cap), Bugs (Exp), Tasks — used in developer & project detail */
export const PIE_COLORS = ['#21944E', '#FA4338', '#4141A2'];

/** Capex vs Opex — used in FTE & Payroll summary donut */
export const DONUT_COLORS = ['#4141A2', '#A4A9B6'];

// ── Bar chart graduated shades (ranked items) ──────────────────
export const GEM_SHADES = ['#4141A2', '#5D5DBC', '#7878D6', '#9494F0'];

// ── Stacked bar semantic colors ────────────────────────────────
export const CHART_SEMANTIC = {
    capex: '#4141A2',
    opex: '#FA4338',
    capitalized: '#4141A2',
    expensed: '#FA4338',
    stories: '#4141A2',
    tasks: '#7FA8C8',
    bugs: '#FA4338',
    epics: '#F5A623',
    subtasks: '#9494F0',
    headcount: '#21944E',
    netAsset: '#F5A623',
} as const;

// ── Tooltip ────────────────────────────────────────────────────
export const TOOLTIP_STYLE = {
    background: '#FFFFFF',
    border: '1px solid #E2E4E9',
    borderRadius: 10,
    fontSize: 12,
} as const;
