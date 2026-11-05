import type { ErrorCode } from '../../errors'

// Maps Supabase Auth error codes to ours. Unknown errors become INTERNAL so the
// provider's wording never reaches the page.
const BY_CODE: Record<string, ErrorCode> = {
  invalid_credentials: 'AUTH_INVALID_CREDENTIALS',
  email_not_confirmed: 'AUTH_EMAIL_NOT_CONFIRMED',
  captcha_failed: 'AUTH_CAPTCHA_FAILED',
  over_request_rate_limit: 'AUTH_RATE_LIMITED',
  over_email_send_rate_limit: 'AUTH_RATE_LIMITED',
  weak_password: 'AUTH_WEAK_PASSWORD',
  same_password: 'INVALID_INPUT',
  validation_failed: 'INVALID_INPUT',
  email_address_invalid: 'INVALID_INPUT',
}

export function classifyAuthError(error: { code?: string; status?: number } | null | undefined): ErrorCode {
  if (!error) return 'INTERNAL'
  const mapped = error.code ? BY_CODE[error.code] : undefined
  if (mapped) return mapped
  if (error.status === 429) return 'AUTH_RATE_LIMITED'
  return 'INTERNAL'
}
