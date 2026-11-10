import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { callRpc } from '../../billing'
import { AppError } from '../../errors'
import type { GenerationTemplate, Resolution } from '../../templates'
import { routeFallbackReason } from '../fallback-notice'
import { selectTemplateRoute } from '../generation-call'
import type { TemplateProvider } from '../provider'

export class BatchTemplateError extends AppError {
  constructor(readonly templateId: string, error = new AppError('TEMPLATE_UNAVAILABLE', 'This template is unavailable.')) {
    super(error.code, `${templateId}: ${error.message}`)
  }

  override toBody() {
    return { ...super.toBody(), template_id: this.templateId }
  }
}

type SaleTemplate = {
  template: Pick<GenerationTemplate['template'], 'id' | 'creditsCost'>
  prompt: Pick<GenerationTemplate['prompt'], 'providerId' | 'styleRefs'>
}

export async function quoteBatchRoute(provider: TemplateProvider, { template, prompt }: SaleTemplate,
  resolution: Resolution, aspectRatio: string) {
  const route = await selectTemplateRoute(provider, prompt.providerId, resolution, aspectRatio, 1, prompt.styleRefs.length)
  return { template_id: template.id, resolution, provider: route.provider.id, expected_credits: template.creditsCost[resolution],
    fallback_route: Boolean(routeFallbackReason(route.provider, prompt.providerId, 'web')) }
}

// The database also checks these routes inside the reservation transaction.
export async function assertBatchRoutes(db: SupabaseClient, routes: Awaited<ReturnType<typeof quoteBatchRoute>>[]) {
  const unavailable = await callRpc(db, 'unavailable_batch_template', { p_routes: routes }, z.string().nullable())
  if (unavailable !== null) throw new BatchTemplateError(unavailable)
}
