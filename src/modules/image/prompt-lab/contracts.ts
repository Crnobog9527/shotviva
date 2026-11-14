import { z } from 'zod'
import { AppError } from '@/core/errors'
import { TEMPLATE_QUALITIES } from '@/core/templates/pricing'

import { matrixSelection } from './plan-matrix'
import { resolutionSchema } from '@/core/templates/db-resolution'

export const routeFields = z.object({
  providerId: z.uuid(), resolution: resolutionSchema, quality: z.enum(TEMPLATE_QUALITIES), useStyleReference: z.boolean(),
})
export const quoteInput = matrixSelection.safeExtend({ ...routeFields.shape, sessionId: z.uuid() })
export const matrixInput = quoteInput.safeExtend({ batchId: z.uuid(), expectedEstimateUsd: z.number().finite().positive() })
export const runInput = z.object({ runId: z.uuid() })
export const publishInput = z.object({
  runId: z.uuid(),
  template: z.object({
    id: z.string().trim().min(1).max(64).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).refine(id => id !== 'edit' && id !== 'freeform'),
    name: z.string().trim().min(1).max(120), nameZh: z.string().trim().max(120).nullable(),
    category: z.string().min(1).max(40),
  }),
})
export const reverseInput = z.object({ sessionId: z.uuid(), requestId: z.uuid() })
export type RouteFields = z.infer<typeof routeFields>
export function input<T>(schema: z.ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw)
  if (!parsed.success) throw new AppError('INVALID_INPUT', '调试参数无效，一批最多试跑 12 张')
  return parsed.data
}
