/**
 * Chart of accounts — Fix #22
 *
 * Centralises all account name strings so that:
 *  - changes to the chart of accounts require a single edit here
 *  - routes and tests can import typed constants instead of magic strings
 */

export const ACCOUNTS = {
    // Asset accounts
    WIP_SOFTWARE:           'WIP — Software Assets',
    ACCUMULATED_AMORT:      'Accumulated Amortization — Software',

    // Expense accounts
    RD_SALARIES:            'R&D Salaries / Payroll Expense',
    RD_EXPENSE_SOFTWARE:    'R&D Expense — Software',
    AMORTIZATION_EXPENSE:   'Amortization Expense',
    ACCRUED_PAYROLL:        'Accrued Payroll / Cash',
    OVERHEAD_PAYROLL:       'Payroll Expense — Overhead / Meetings',
} as const;

export type AccountName = typeof ACCOUNTS[keyof typeof ACCOUNTS];

/**
 * Journal entry types used across the application.
 */
export const ENTRY_TYPES = {
    CAPITALIZATION: 'CAPITALIZATION',
    EXPENSE:        'EXPENSE',
    EXPENSE_BUG:    'EXPENSE_BUG',   // Bug-ticket costs (all projects)
    EXPENSE_TASK:   'EXPENSE_TASK',  // Task/Epic/Subtask costs (non-cap projects)
    ADJUSTMENT:     'ADJUSTMENT',    // Meeting-time overhead deduction
    AMORTIZATION:   'AMORTIZATION',
} as const;

export type EntryType = keyof typeof ENTRY_TYPES;

/**
 * Accounting period statuses.
 */
export const PERIOD_STATUSES = ['OPEN', 'CLOSED', 'LOCKED'] as const;
export type PeriodStatus = typeof PERIOD_STATUSES[number];

/**
 * Project lifecycle statuses.
 */
export const PROJECT_STATUSES = ['PLANNING', 'DEV', 'LIVE', 'RETIRED'] as const;
export type ProjectStatus = typeof PROJECT_STATUSES[number];

/**
 * Developer roles.
 */
export const DEVELOPER_ROLES = ['ENG', 'PRODUCT', 'DESIGN', 'DATA', 'QA'] as const;
export type DeveloperRole = typeof DEVELOPER_ROLES[number];

/**
 * User roles.
 */
export const USER_ROLES = ['ADMIN', 'VIEWER'] as const;
export type UserRole = typeof USER_ROLES[number];

/**
 * Jira issue types used for capitalization classification.
 */
export const ISSUE_TYPES = {
    STORY:   'STORY',
    BUG:     'BUG',
    TASK:    'TASK',
    EPIC:    'EPIC',
    SUBTASK: 'SUBTASK',
} as const;

export type IssueType = typeof ISSUE_TYPES[keyof typeof ISSUE_TYPES];

