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
  // Not printable ASCII without whitespace, or outside 16–1024 characters.
  'api_key_invalid',
  // The row has no usable key in Vault (never set, cleared, or the Vault entry is gone).
  'api_key_missing',
  'not_found',
  // Deleting the row in use (ARCHITECTURE §3.3): switch to another one first.
  'provider_active',
  'provider_referenced',
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
