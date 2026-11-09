import 'server-only'

import { jsonResponse } from '../../api-response'
import { AppError, type ErrorCode } from '../../errors'

const failures: Record<string, readonly [ErrorCode, string] | undefined> = {
  not_found: ['CODE_NOT_FOUND', 'Code not found'],
  expired: ['CODE_EXPIRED', 'This code is inactive or expired'],
  full: ['CODE_FULL', 'This code has been fully claimed'],
  used: ['CODE_USED', 'You have already used this code'],
  new_users_only: ['CODE_NEW_USERS_ONLY', 'This code is for new accounts only'],
  own: ['CODE_OWN', 'You cannot use your own invite code'],
  already_invited: ['CODE_ALREADY_INVITED', 'You have already joined with an invite'],
  needs_confirm: ['CODE_NEEDS_CONFIRM', 'Confirm replacement of the existing discount'],
  checkout_in_progress: ['CODE_CHECKOUT_IN_PROGRESS', 'A checkout is using the current discount'],
  blocked_same_ip: ['CODE_INVITE_INELIGIBLE', 'This account is ineligible for an invite reward'],
  blocked_no_signup_grant: ['CODE_INVITE_INELIGIBLE', 'This account is ineligible for an invite reward'],
  banned: ['FORBIDDEN', 'This account is suspended'],
  rate_limited: ['RATE_LIMITED', 'Too many attempts in the last hour'],
  invalid_input: ['INVALID_INPUT', 'Enter a valid code'],
}

export function redemptionResponse(result: { status: string; currentCode?: string | null }) {
  if (result.status === 'ok') return jsonResponse(result)
  const failure = failures[result.status]
  if (!failure) throw new Error('Unexpected code redemption result')
  const error = new AppError(...failure)
  const body = result.status === 'needs_confirm' ? { ...error.toBody(), currentCode: result.currentCode } : error.toBody()
  return jsonResponse(body, error.status)
}
