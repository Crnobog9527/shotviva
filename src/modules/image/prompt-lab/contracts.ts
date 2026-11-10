import { z } from 'zod'
import { AppError } from '@/core/errors'
import { RESOLUTIONS } from '@/core/templates/output-options'
import { TEMPLATE_QUALITIES } from '@/core/templates/pricing'

import { matrixSelection } from './plan-matrix'

export const routeFields = z.object({
  providerId: z.uuid(), resolution: z.enum(RESOLUTIONS), quality: z.enum(TEMPLATE_QUALITIES), useStyleReference: z.boolean(),
})
export const quoteInput = matrixSelection.safeExtend({ ...routeFields.shape, sessionId: z.uuid() })
export const matrixInput = quoteInput.safeExtend({ batchId: z.uuid(), expectedEstimateUsd: z.number().finite().positive() })
export const runInput = z.object({ runId: z.uuid() })
export const reverseInput = z.object({ sessionId: z.uuid(), requestId: z.uuid() })
export type RouteFields = z.infer<typeof routeFields>
export function input<T>(schema: z.ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw)
  if (!parsed.success) throw new AppError('INVALID_INPUT', '调试参数无效，一批最多试跑 12 张')
  return parsed.data
}
