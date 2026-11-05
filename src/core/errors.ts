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
  // Idempotency key reused for a different request, or a job settled the other way.
  'CONFLICT',
  // Per-account generation limit (core/jobs/rate-limit.ts).
  'RATE_LIMITED',
  // Upload checks (ARCHITECTURE §8.2): over 20MB, or not a JPEG/PNG/WebP we can decode.
  'IMAGE_TOO_LARGE',
  'IMAGE_UNSUPPORTED',
  // The provider's own safety refusal; credits are refunded.
  'CONTENT_REJECTED',
  // Provider error, timeout or output write failure; credits are refunded.
  'GENERATION_FAILED',
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
  CONFLICT: 409,
  RATE_LIMITED: 429,
  IMAGE_TOO_LARGE: 422,
  IMAGE_UNSUPPORTED: 422,
  CONTENT_REJECTED: 422,
  GENERATION_FAILED: 502,
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

// Unknown throwables become INTERNAL so internal details never leak to clients.
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error
  return new AppError('INTERNAL', 'Something went wrong', { cause: error })
}
