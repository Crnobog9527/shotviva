import type { ErrorCode } from '../../errors'
import type { SmsLimitStatus } from '../phone/sms-limits'

// Supabase Auth errors on the phone path (signInWithOtp / verifyOtp) to ours. A Send SMS hook
// refusal arrives as a hook or SMS failure, which the visitor sees as "the SMS didn't go out".
const BY_CODE: Record<string, ErrorCode> = {
  captcha_failed: 'AUTH_CAPTCHA_FAILED',
  otp_expired: 'AUTH_OTP_INVALID',
  invalid_credentials: 'AUTH_OTP_INVALID',
  over_sms_send_rate_limit: 'AUTH_SMS_COOLDOWN',
  over_request_rate_limit: 'AUTH_RATE_LIMITED',
  phone_not_confirmed: 'AUTH_OTP_INVALID',
  validation_failed: 'AUTH_PHONE_INVALID',
  sms_send_failed: 'AUTH_SMS_FAILED',
  hook_timeout: 'AUTH_SMS_FAILED',
  hook_timeout_after_retry: 'AUTH_SMS_FAILED',
  hook_payload_invalid_content_type: 'AUTH_SMS_FAILED',
  hook_payload_over_size_limit: 'AUTH_SMS_FAILED',
}

export function classifyPhoneError(error: { code?: string; status?: number } | null | undefined): ErrorCode {
  const mapped = error?.code ? BY_CODE[error.code] : undefined
  if (mapped) return mapped
  if (error?.status === 429) return 'AUTH_SMS_COOLDOWN'
  return 'AUTH_SMS_FAILED'
}

// Our own limits (sms_request_send) to the line the form shows.
export function limitError(status: Exclude<SmsLimitStatus, 'ok'>): ErrorCode {
  return status === 'phone_cooldown' ? 'AUTH_SMS_COOLDOWN' : status === 'no_request' ? 'AUTH_SMS_FAILED' : 'AUTH_SMS_DAILY_LIMIT'
}
