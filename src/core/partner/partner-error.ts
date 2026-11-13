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
  IDENTITY_SWAP_REFUSED: 422,
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
  // Code redemption is only exposed through the signed-in web route.
  CODE_NOT_FOUND: 'internal',
  CODE_EXPIRED: 'internal',
  CODE_FULL: 'internal',
  CODE_USED: 'internal',
  CODE_NEW_USERS_ONLY: 'internal',
  CODE_OWN: 'internal',
  CODE_ALREADY_INVITED: 'internal',
  CODE_NEEDS_CONFIRM: 'internal',
  CODE_CHECKOUT_IN_PROGRESS: 'internal',
  CODE_CHECKOUT_OFFER_CHANGED: 'internal',
  CODE_CHECKOUT_FLOOR: 'internal',
  CODE_INVITE_INELIGIBLE: 'internal',
  AUTH_PHONE_INVALID: 'internal',
  AUTH_CONSENT_REQUIRED: 'internal',
  AUTH_SMS_COOLDOWN: 'internal',
  AUTH_SMS_DAILY_LIMIT: 'internal',
  AUTH_SMS_FAILED: 'internal',
  AUTH_OTP_INVALID: 'internal',
  CONFLICT: 'invalid_input',
  TEMPLATE_UNAVAILABLE: 'invalid_input',
  TEMPLATE_QUOTE_CHANGED: 'invalid_input',
  RATE_LIMITED: 'rate_limited',
  // The partner contract (§14.6) has no tier code and no partner route is tier-gated; reaching
  // this is a server bug, not something the partner can act on.
  TIER_REQUIRED: 'internal',
  IMAGE_TOO_LARGE: 'invalid_input',
  IMAGE_UNSUPPORTED: 'invalid_input',
  REFERENCE_IMAGE_LIMIT: 'invalid_input',
  MODEL_INPUT_UNSUPPORTED: 'invalid_input',
  CONTENT_REJECTED: 'content_rejected',
  IDENTITY_SWAP_REFUSED: 'IDENTITY_SWAP_REFUSED',
  GENERATION_FAILED: 'generation_failed',
  // Account deletion only; no partner route deletes accounts.
  SUBSCRIPTION_CANCEL_FAILED: 'internal',
  DOWNGRADE_NOT_ALLOWED: 'internal',
  // Saved templates are a web-only feature; no partner route saves templates.
  FAVORITES_LIMIT: 'internal',
  // Admin-only (T85); never on a partner route.
  TEST_BUDGET_EXCEEDED: 'internal',
  // Support tickets are web-only; no partner route writes to one.
  TICKET_CLOSED: 'internal',
  // The partner API does not use user sessions (§14.3).
  AUTH_UNAVAILABLE: 'internal',
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
