import { z } from 'zod'

import { GOALS, OPTION_ID, STATUSES, SURFACES } from '../../experiments'

// /admin/experiments rows and inputs (ARCHITECTURE §16.5). Labels are the admin's own short names.

export const variantRowSchema = z.object({
  id: z.number().int(),
  option_id: z.string(),
  label: z.string(),
  weight: z.number().int(),
  is_control: z.boolean(),
  archived_at: z.string().nullable(),
  fallback_variant_id: z.number().int().nullable(),
})
export type VariantRow = z.infer<typeof variantRowSchema>

export const experimentRowSchema = z.object({
  id: z.number().int(),
  surface: z.enum(SURFACES),
  name: z.string(),
  goal: z.enum(GOALS),
  status: z.enum(STATUSES),
  winner_variant_id: z.number().int().nullable(),
  started_at: z.string().nullable(),
  ended_at: z.string().nullable(),
  created_at: z.string(),
  experiment_variants: z.array(variantRowSchema),
})
export type ExperimentRow = z.infer<typeof experimentRowSchema>

export const variantInputSchema = z.object({
  optionId: z.string().regex(OPTION_ID),
  label: z.string().trim().min(1).max(40),
  weight: z.number().int().min(0).max(100),
  isControl: z.boolean(),
})

export const saveInputSchema = z.object({
  id: z.number().int().positive().nullable(),
  surface: z.enum(SURFACES),
  name: z.string().trim().min(1).max(80),
  goal: z.enum(GOALS),
  variants: z.array(variantInputSchema).min(2).max(4),
})
export type SaveInput = z.infer<typeof saveInputSchema>

export const ACTIONS = ['start', 'pause', 'resume', 'end', 'archive', 'delete'] as const
export type ExperimentAction = (typeof ACTIONS)[number]

export const actInputSchema = z.object({
  id: z.number().int().positive(),
  action: z.enum(ACTIONS),
  variant: z.number().int().positive().nullable().default(null),
  fallback: z.number().int().positive().nullable().default(null),
})
export type ActInput = z.infer<typeof actInputSchema>

// admin_experiment_results (1545), one row per variant.
export const resultRowSchema = z.object({
  variant_id: z.number().int(),
  signups: z.coerce.number().int(),
  first_generations: z.coerce.number().int(),
  payments: z.coerce.number().int(),
  now_on: z.coerce.number().int(),
  moved: z.coerce.number().int(),
})
export type ResultRow = z.infer<typeof resultRowSchema>
