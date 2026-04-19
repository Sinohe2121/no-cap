import { z } from 'zod';
import { PROJECT_STATUSES, PERIOD_STATUSES } from '@/lib/constants';

// ═══════════════════════════════════════════════════════════════════════════
// Admin schemas
// ═══════════════════════════════════════════════════════════════════════════

export const CreateUserSchema = z.object({
    email: z.string().email('Invalid email address'),
    name: z.string().min(1, 'Name is required'),
    role: z.string().min(1, 'Role is required'),
    password: z.preprocess(
        (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
        z.string().min(8, 'Password must be at least 8 characters').optional()
    ),
});

const AdminConfigSchema = z.object({
    type: z.literal('config'),
    key: z.string().min(1, 'Config key is required'),
    value: z.union([z.string(), z.number(), z.boolean()]),
    label: z.string().optional(),
});

const AdminRolesSchema = z.object({
    type: z.literal('roles_array'),
    roles: z.array(z.object({
        id: z.string(),
        name: z.string(),
        isSystem: z.boolean().optional(),
        permissions: z.array(z.string()),
    })).min(1, 'At least one role is required'),
});

const AdminUserRoleSchema = z.object({
    type: z.literal('user_role'),
    id: z.string().min(1, 'User id is required'),
    role: z.string().min(1, 'Role is required'),
});

export const AdminUpdateSchema = z.discriminatedUnion('type', [
    AdminConfigSchema,
    AdminRolesSchema,
    AdminUserRoleSchema,
]);

// ═══════════════════════════════════════════════════════════════════════════
// Projects schemas
// ═══════════════════════════════════════════════════════════════════════════

export const CreateProjectSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    epicKey: z.string().optional().default(''),
    description: z.string().nullable().optional(),
    status: z.enum(PROJECT_STATUSES).default('PLANNING'),
    isCapitalizable: z.boolean().default(true),
    amortizationMonths: z.number().int().positive().default(36),
    startDate: z.string().nullable().optional(),
    launchDate: z.string().nullable().optional(),
    startingBalance: z.number().min(0).default(0),
    startingAmortization: z.number().min(0).default(0),
    amortizationSchedule: z.array(z.object({
        month: z.number().int().min(1).max(12),
        year: z.number().int().min(2000).max(2100),
        charge: z.number().min(0),
    })).optional(),
    parentProjectId: z.string().optional(),
});

export const UpdateProjectSchema = z.object({
    id: z.string().min(1, 'Project id is required'),
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    status: z.enum(PROJECT_STATUSES).optional(),
    isCapitalizable: z.boolean().optional(),
    overrideReason: z.string().nullable().optional(),
    startDate: z.string().nullable().optional(),
    startingBalance: z.number().min(0).optional(),
    startingAmortization: z.number().min(0).optional(),
    launchDate: z.string().nullable().optional(),
    amortizationMonths: z.number().int().positive().optional(),
    mgmtAuthorized: z.boolean().optional(),
    probableToComplete: z.boolean().optional(),
});

// ═══════════════════════════════════════════════════════════════════════════
// Amortization override schemas
// ═══════════════════════════════════════════════════════════════════════════

const AmortizationOverrideEntry = z.object({
    month: z.number().int().min(1).max(12),
    year: z.number().int().min(2000).max(2100),
    charge: z.number().min(0),
});

export const AmortizationOverrideSchema = z.union([
    z.object({ reset: z.literal(true) }),
    z.object({
        overrides: z.array(AmortizationOverrideEntry).min(1, 'At least one override is required'),
        reset: z.literal(false).optional(),
    }),
]);

// ═══════════════════════════════════════════════════════════════════════════
// Helper: format Zod errors into a clean API response
// ═══════════════════════════════════════════════════════════════════════════

export function formatZodError(error: z.ZodError): string {
    return error.issues
        .map(i => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
}

// ═══════════════════════════════════════════════════════════════════════════
// Accounting schemas
// ═══════════════════════════════════════════════════════════════════════════

export const GenerateEntriesSchema = z.object({
    month: z.number().int().min(1).max(12),
    year: z.number().int().min(2000),
});

export const UpdatePeriodStatusSchema = z.object({
    periodId: z.string().min(1, 'periodId is required'),
    status: z.enum(PERIOD_STATUSES),
});

// ═══════════════════════════════════════════════════════════════════════════
// Developer schemas
// ═══════════════════════════════════════════════════════════════════════════

export const UpdateDeveloperSchema = z.object({
    id: z.string().min(1, 'id is required'),
    monthlySalary: z.number().min(0).optional(),
    stockCompAllocation: z.number().min(0).optional(),
    fringeBenefitRate: z.number().min(0).optional(),
    isActive: z.boolean().optional(),
});

export const CreateDeveloperSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Invalid email'),
    jiraUserId: z.string().nullable().optional(),
    role: z.string().min(1, 'Role is required'),
    monthlySalary: z.number().min(0).optional(),
    fringeBenefitRate: z.number().min(0).optional(),
    stockCompAllocation: z.number().min(0).optional(),
});

export const PatchDeveloperSchema = z.object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    jiraUserId: z.string().nullable().optional(),
    role: z.string().optional(),
    monthlySalary: z.number().min(0).optional(),
    stockCompAllocation: z.number().min(0).optional(),
    fringeBenefitRate: z.number().min(0).optional(),
    isActive: z.boolean().optional(),
});

export const BulkCreateDevelopersSchema = z.object({
    developers: z.array(z.object({
        name: z.string().min(1),
        email: z.string().email(),
        role: z.string().optional(),
    })).min(1, 'At least one developer is required'),
});

// ═══════════════════════════════════════════════════════════════════════════
// Integration config schemas
// ═══════════════════════════════════════════════════════════════════════════

export const JiraConfigSchema = z.object({
    host: z.string().min(1, 'Jira host is required'),
    email: z.string().email('Valid email is required'),
    token: z.string().min(1, 'API token is required'),
    customFields: z.array(z.object({
        id: z.string(),
        name: z.string(),
    })).optional(),
});

export const BambooHRConfigSchema = z.object({
    subdomain: z.string().min(1, 'Subdomain is required'),
    apiKey: z.string().min(1, 'API key is required'),
});

export const JiraImportSchema = z.object({
    tickets: z.array(z.object({
        ticketId: z.string(),
        epicKey: z.string(),
        projectId: z.string().nullable(),
        projectName: z.string(),
        issueType: z.string(),
        summary: z.string(),
        storyPoints: z.number(),
        resolutionDate: z.string().nullable().optional(),
        assigneeId: z.string().nullable(),
        assigneeName: z.string(),
        customFields: z.record(z.string(), z.string()).optional(),
    })).min(1, 'At least one ticket is required'),
    importPeriod: z.string().optional(),
});

// ═══════════════════════════════════════════════════════════════════════════
// Payroll schemas
// ═══════════════════════════════════════════════════════════════════════════

export const PayrollUploadSchema = z.object({
    data: z.array(z.object({
        name: z.string(),
        email: z.string().email(),
        monthlySalary: z.number().min(0),
        stockCompAllocation: z.number().min(0).optional(),
    })).min(1, 'No data provided'),
});

export const PayrollRegisterImportSchema = z.object({
    label: z.string().min(1, 'Label is required'),
    payDate: z.string().min(1, 'Pay date is required'),
    rows: z.array(z.object({
        email: z.string().email(),
        name: z.string(),
        grossSalary: z.preprocess(
            (v) => typeof v === 'string' ? parseFloat(v.replace(/[$,\s]/g, '')) : v,
            z.number().min(0)
        ),
        sbcAmount: z.preprocess(
            (v) => (v == null || v === '') ? 0 : typeof v === 'string' ? parseFloat(v.replace(/[$,\s]/g, '')) : v,
            z.number().min(0)
        ).optional(),
    })).min(1, 'At least one row is required'),
});

// ═══════════════════════════════════════════════════════════════════════════
// SOC2 schemas
// ═══════════════════════════════════════════════════════════════════════════

export const CreateEvidenceSchema = z.object({
    controlId: z.string().min(1, 'controlId is required'),
    title: z.string().min(1, 'Title is required'),
    description: z.string().optional(),
    url: z.string().optional(),
    reviewer: z.string().optional(),
});

export const UpdateEvidenceSchema = z.object({
    id: z.string().min(1, 'id is required'),
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    url: z.string().optional(),
    reviewer: z.string().optional(),
    isVerified: z.boolean().optional(),
    reviewedAt: z.string().optional(),
});

export const DeleteByIdSchema = z.object({
    id: z.string().min(1, 'id is required'),
});

export const CreateControlSchema = z.object({
    criterion: z.string().min(1, 'Criterion is required'),
    controlId: z.string().min(1, 'controlId is required'),
    title: z.string().min(1, 'Title is required'),
    description: z.string().optional(),
    frequency: z.string().optional(),
});

export const UpdateControlSchema = z.object({
    id: z.string().min(1, 'id is required'),
    criterion: z.string().optional(),
    controlId: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    frequency: z.string().optional(),
    status: z.string().optional(),
});

export const CreateRiskSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    likelihood: z.string().optional(),
    impact: z.string().optional(),
    mitigation: z.string().optional(),
    status: z.string().optional(),
});

export const UpdateRiskSchema = z.object({
    id: z.string().min(1, 'id is required'),
    title: z.string().optional(),
    likelihood: z.string().optional(),
    impact: z.string().optional(),
    mitigation: z.string().optional(),
    status: z.string().optional(),
});

export const CreateIncidentSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    severity: z.string().min(1, 'Severity is required'),
    description: z.string().optional(),
    occurredAt: z.string().optional(),
    isResolved: z.boolean().optional(),
    resolvedAt: z.string().nullable().optional(),
});

export const UpdateIncidentSchema = z.object({
    id: z.string().min(1, 'id is required'),
    title: z.string().optional(),
    severity: z.string().optional(),
    description: z.string().optional(),
    occurredAt: z.string().optional(),
    isResolved: z.boolean().optional(),
    resolvedAt: z.string().nullable().optional(),
});

// ═══════════════════════════════════════════════════════════════════════════
// Rules & budget schemas
// ═══════════════════════════════════════════════════════════════════════════

export const ClassificationRuleSchema = z.object({
    field: z.string(),
    operator: z.string(),
    value: z.string(),
    action: z.string(),
});

export const ClassificationRulesArraySchema = z.array(ClassificationRuleSchema);

export const BudgetTargetSchema = z.object({
    projectId: z.string().min(1, 'projectId is required'),
    budgetTarget: z.number().nullable(),
});

// ═══════════════════════════════════════════════════════════════════════════
// GitHub repos schemas
// ═══════════════════════════════════════════════════════════════════════════

export const AddGitHubRepoSchema = z.object({
    owner: z.string().min(1, 'Owner is required'),
    name: z.string().min(1, 'Repo name is required'),
    projectId: z.string().nullable().optional(),
});

export const PatchGitHubRepoSchema = z.object({
    id: z.string().min(1, 'id is required'),
    projectId: z.string().nullable().optional(),
});
