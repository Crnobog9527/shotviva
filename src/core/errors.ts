import type { MembershipTier } from './config'

// Single source of error codes. User-facing copy lives in the UI layer, not here,
// so log messages and what the user sees can evolve independently.
export const ERROR_CODES = [
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'INVALID_INPUT',
  'CREDITS_INSUFFICIENT',
  'AUTH_INVALID_CREDENTIALS',
  'AUTH_EMAIL_NOT_CONFIRMED',
  'AUTH_CAPTCHA_FAILED',
  'AUTH_RATE_LIMITED',
  'AUTH_WEAK_PASSWORD',
  'CODE_NOT_FOUND',
  'CODE_EXPIRED',
  'CODE_FULL',
  'CODE_USED',
  'CODE_NEW_USERS_ONLY',
  'CODE_OWN',
  'CODE_ALREADY_INVITED',
  'CODE_NEEDS_CONFIRM',
  'CODE_CHECKOUT_IN_PROGRESS',
  'CODE_CHECKOUT_OFFER_CHANGED',
  'TEMPLATE_UNAVAILABLE',
  'TEMPLATE_QUOTE_CHANGED',
  'CODE_CHECKOUT_FLOOR',
  'CODE_INVITE_INELIGIBLE',
  // Phone sign-in (T63): not a mainland +86 mobile number; the consent box was not ticked; the
  // number's 60-second gap or a daily limit (number or network); the SMS did not go out; a wrong
  // or expired code.
  'AUTH_PHONE_INVALID',
  'AUTH_CONSENT_REQUIRED',
  'AUTH_SMS_COOLDOWN',
  'AUTH_SMS_DAILY_LIMIT',
  'AUTH_SMS_FAILED',
  'AUTH_OTP_INVALID',
  // Idempotency key reused for a different request, or a job settled the other way.
  'CONFLICT',
  // Per-account generation limit (core/jobs/rate-limit.ts).
  'RATE_LIMITED',
  // The membership tier is too low for this (a batch bigger than the tier allows, a Max-only
  // feature); the body names required_tier so the paywall can open on it (ARCHITECTURE §6.2).
  'TIER_REQUIRED',
  // Upload checks (ARCHITECTURE §8.2): over 20MB, or not a JPEG/PNG/WebP we can decode.
  'IMAGE_TOO_LARGE',
  'IMAGE_UNSUPPORTED',
  'REFERENCE_IMAGE_LIMIT',
  'MODEL_INPUT_UNSUPPORTED',
  // The provider's own safety refusal; credits are refunded.
  'CONTENT_REJECTED',
  // The user's words ask to swap a face or turn someone into a real person (ARCHITECTURE §5.1a,
  // T81); refused before any credit is reserved.
  'IDENTITY_SWAP_REFUSED',
  // Provider error, timeout or output write failure; credits are refunded.
  'GENERATION_FAILED',
  // Account deletion: Stripe would not cancel a live subscription, so nothing was deleted
  // (ARCHITECTURE §13).
  'SUBSCRIPTION_CANCEL_FAILED',
  // A membership checkout for the same plan or a lower one while a membership runs: only
  // upgrades (ARCHITECTURE §6.2 「升级」, T66); to go lower, cancel and buy again once it ends.
  'DOWNGRADE_NOT_ALLOWED',
  // Saved templates (ARCHITECTURE §5.1b, T83): the account already holds the most it may.
  'FAVORITES_LIMIT',
  // Admin test runs (ARCHITECTURE §10.b, T85): today's test-run budget is spent; nothing was called.
  'TEST_BUDGET_EXCEEDED',
  'INTERNAL',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

const HTTP_STATUS: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID_INPUT: 422,
  CREDITS_INSUFFICIENT: 402,
  AUTH_INVALID_CREDENTIALS: 401,
  AUTH_EMAIL_NOT_CONFIRMED: 403,
  AUTH_CAPTCHA_FAILED: 422,
  AUTH_RATE_LIMITED: 429,
  AUTH_WEAK_PASSWORD: 422,
  CODE_NOT_FOUND: 404,
  CODE_EXPIRED: 410,
  CODE_FULL: 409,
  CODE_USED: 409,
  CODE_NEW_USERS_ONLY: 403,
  CODE_OWN: 422,
  CODE_ALREADY_INVITED: 409,
  CODE_NEEDS_CONFIRM: 409,
  CODE_CHECKOUT_IN_PROGRESS: 409,
  CODE_CHECKOUT_OFFER_CHANGED: 409,
  TEMPLATE_UNAVAILABLE: 422,
  TEMPLATE_QUOTE_CHANGED: 409,
  CODE_CHECKOUT_FLOOR: 409,
  CODE_INVITE_INELIGIBLE: 403,
  AUTH_PHONE_INVALID: 422,
  AUTH_CONSENT_REQUIRED: 422,
  AUTH_SMS_COOLDOWN: 429,
  AUTH_SMS_DAILY_LIMIT: 429,
  AUTH_SMS_FAILED: 502,
  AUTH_OTP_INVALID: 401,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  TIER_REQUIRED: 403,
  IMAGE_TOO_LARGE: 422,
  IMAGE_UNSUPPORTED: 422,
  REFERENCE_IMAGE_LIMIT: 422,
  MODEL_INPUT_UNSUPPORTED: 422,
  CONTENT_REJECTED: 422,
  IDENTITY_SWAP_REFUSED: 422,
  GENERATION_FAILED: 502,
  SUBSCRIPTION_CANCEL_FAILED: 502,
  DOWNGRADE_NOT_ALLOWED: 409,
  FAVORITES_LIMIT: 409,
  TEST_BUDGET_EXCEEDED: 429,
  INTERNAL: 500,
}

export type ErrorBody = { code: ErrorCode; message: string }

export class AppError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'AppError'
    this.code = code
  }

  get status(): number {
    return HTTP_STATUS[this.code]
  }

  toBody(): ErrorBody {
    return { code: this.code, message: this.message }
  }
}

export class TierRequiredError extends AppError {
  readonly requiredTier: MembershipTier

  constructor(requiredTier: MembershipTier, message: string) {
    super('TIER_REQUIRED', message)
    this.requiredTier = requiredTier
  }

  override toBody(): ErrorBody & { required_tier: MembershipTier; requiredTier: MembershipTier } {
    return { ...super.toBody(), requiredTier: this.requiredTier, required_tier: this.requiredTier }
  }
}

// Unknown throwables become INTERNAL so internal details never leak to clients.
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error
  return new AppError('INTERNAL', 'Something went wrong', { cause: error })
}
