import 'server-only'

import type { NextResponse } from 'next/server'
import type { z } from 'zod'

import type { IdentityJudge } from '../identity-guard'
import type { GenerationProvider } from '../jobs'
import type { FetchLike } from './fetch-image'
import { checkedReturnTo, type PartnerRouteDeps } from './handlers'
import { authenticatePartner } from './partner-auth'
import { partnerErrorResponse, partnerJson, PartnerError } from './partner-error'
import { partnerGenerate } from './partner-generate'
import {
  generateRequestSchema,
  idempotencyKeySchema,
  PARTNER_IDEMPOTENCY_HEADER,
  type GenerateResponse,
} from './partner-types'
import { partnerImageUrl, partnerProfile } from './partner-views'
import { topUpUrl } from './return-to'

export type PartnerGenerateRouteDeps = PartnerRouteDeps & {
  provider: GenerationProvider
  providerTimeoutMs?: number
  fetch?: FetchLike
  // The face-swap screen's decision call (ARCHITECTURE §5.1a); absent means keywords only.
  identityJudge?: IdentityJudge | null
}

function describe(error: z.ZodError): string {
  const issue = error.issues[0]
  return issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'Invalid body'
}

function parse(request: Request, raw: unknown) {
  const key = idempotencyKeySchema.safeParse(request.headers.get(PARTNER_IDEMPOTENCY_HEADER))
  if (!key.success) throw new PartnerError('invalid_input', `${PARTNER_IDEMPOTENCY_HEADER} header is required`)
  const body = generateRequestSchema.safeParse(raw)
  if (!body.success) throw new PartnerError('invalid_input', describe(body.error))
  return { idempotencyKey: key.data, body: body.data }
}

// POST /api/partner/generate. Every rejection before the reservation (auth, body, return_to,
// image URL, template fields, rate limit) leaves the balance untouched.
export async function handleGenerate(request: Request, deps: PartnerGenerateRouteDeps): Promise<NextResponse> {
  let topUp = topUpUrl(deps.origin)
  try {
    const userId = await authenticatePartner(request, deps)
    const { idempotencyKey, body } = parse(request, await request.json().catch(() => null))
    topUp = topUpUrl(deps.origin, checkedReturnTo(body.return_to, deps.config))
    const outcome = await partnerGenerate(
      { ...deps, imageHosts: deps.config.imageHosts },
      { userId, idempotencyKey, body },
    )
    const [imageUrl, profile] = await Promise.all([partnerImageUrl(deps.store, outcome), partnerProfile(deps.db, userId)])
    const running = outcome.status !== 'succeeded'
    const response: GenerateResponse = {
      job_id: outcome.id,
      status: running ? 'running' : 'succeeded',
      image_url: imageUrl,
      credits_charged: outcome.creditsCost,
      credits_remaining: profile.credits,
      free_credits_remaining: profile.freeCredits,
    }
    return partnerJson(response, running ? 202 : 200)
  } catch (error) {
    return partnerErrorResponse(error, { route: 'partner-generate', topUpUrl: topUp })
  }
}
