import { AppError } from '../errors'

// Why a provider setting was refused. The admin page shows each reason in its own words
// (messages: admin.providers.errors.*); logs keep the English message.
export const PROVIDER_SETTING_REASONS = [
  'invalid_input',
  'base_url_invalid',
  'base_url_not_https',
  'base_url_private',
  'base_url_unresolvable',
  'api_key_required',
  'not_found',
  'secrets_key_missing',
  'secret_unreadable',
  // Anything unexpected; the details are logged, never shown.
  'internal',
] as const
export type ProviderSettingReason = (typeof PROVIDER_SETTING_REASONS)[number]

export class ProviderSettingError extends AppError {
  readonly reason: ProviderSettingReason

  constructor(reason: ProviderSettingReason, message: string) {
    super(reason === 'not_found' ? 'NOT_FOUND' : 'INVALID_INPUT', message)
    this.name = 'ProviderSettingError'
    this.reason = reason
  }
}
