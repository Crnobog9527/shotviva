import 'server-only'

import { NextResponse } from 'next/server'

import { AppError, type ErrorCode } from '../errors'
import { GenerationFailure } from '../jobs'
import { logger } from '../logger'
import type { PartnerErrorBody, PartnerErrorCode } from './partner-types'

const HTTP_STATUS: Record<PartnerErrorCode, number> = {
  unauthorized: 401,
  link_revoked: 401,
  invalid_input: 422,
  quota_exhausted: 402,
  content_rejected: 422,
  generation_failed: 500,
  rate_limited: 429,
  not_found: 404,
  internal: 500,
}

// The partner API speaks its own error vocabulary (ARCHITECTURE §14.4); core errors map onto it.
const FROM_APP: Record<ErrorCode, PartnerErrorCode> = {
  UNAUTHORIZED: 'unauthorized',
  // A banned account (reserve_credits) can no longer be used through the link.
  FORBIDDEN: 'link_revoked',
  NOT_FOUND: 'not_found',
  INVALID_INPUT: 'invalid_input',
  CREDITS_INSUFFICIENT: 'quota_exhausted',
  AUTH_INVALID_CREDENTIALS: 'internal',
  AUTH_EMAIL_NOT_CONFIRMED: 'internal',
  AUTH_CAPTCHA_FAILED: 'internal',
  AUTH_RATE_LIMITED: 'internal',
  AUTH_WEAK_PASSWORD: 'internal',
  CONFLICT: 'invalid_input',
  RATE_LIMITED: 'rate_limited',
  // The partner contract (§14.6) has no tier code and no partner route is tier-gated; reaching
  // this is a server bug, not something the partner can act on.
  TIER_REQUIRED: 'internal',
  IMAGE_TOO_LARGE: 'invalid_input',
  IMAGE_UNSUPPORTED: 'invalid_input',
  CONTENT_REJECTED: 'content_rejected',
  GENERATION_FAILED: 'generation_failed',
  // Account deletion only; no partner route deletes accounts.
  SUBSCRIPTION_CANCEL_FAILED: 'internal',
  INTERNAL: 'internal',
}

export class PartnerError extends Error {
  readonly code: PartnerErrorCode

  constructor(code: PartnerErrorCode, message: string) {
    super(message)
    this.name = 'PartnerError'
    this.code = code
  }
}

export type PartnerErrorContext = { route: string; topUpUrl?: string }

export function toPartnerErrorBody(error: unknown, topUpUrl?: string): PartnerErrorBody {
  if (error instanceof PartnerError) return { code: error.code, message: error.message }
  if (!(error instanceof AppError)) return { code: 'internal', message: 'Something went wrong' }
  const code = FROM_APP[error.code]
  const body: PartnerErrorBody = { code, message: code === 'internal' ? 'Something went wrong' : error.message }
  if (code === 'quota_exhausted' && topUpUrl) body.top_up_url = topUpUrl
  if (error instanceof GenerationFailure) Object.assign(body, { job_id: error.jobId, refunded: error.refunded })
  return body
}

const NO_STORE = { 'Cache-Control': 'private, no-store' }

export function partnerJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

export function partnerErrorResponse(error: unknown, context: PartnerErrorContext): NextResponse {
  const body = toPartnerErrorBody(error, context.topUpUrl)
  if (body.code === 'internal') logger.error('partner api error', { route: context.route, error })
  return partnerJson(body, HTTP_STATUS[body.code])
}
