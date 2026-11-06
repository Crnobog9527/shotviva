// Image (later video) provider settings and per-request resolution (ARCHITECTURE §3.3).
export { activeCredentials, activeProvider, PROVIDERS_CACHE_TAG, type ProviderCredentials } from './active-provider'
export { assertPublicBaseUrl, isBlockedAddress, parseBaseUrl, type HostResolver } from './base-url'
export { testConnection, type ConnectionResult } from './connection-test'
export {
  activateProvider,
  adminDeleteProvider,
  findProvider,
  deleteProvider,
  findProviderRow,
  insertProvider,
  listProviders,
  loadActiveProviderRow,
  updateProvider,
  type ProviderWrite,
} from './repository'
export { apiKeySchema, readProviderKey, setProviderKey } from './keys'
export { resolveProvider, type ReadProviderKey } from './resolve'
export { PROVIDER_SETTING_REASONS, ProviderSettingError, type ProviderSettingReason } from './setting-error'
export {
  DEFAULT_BASE_URL,
  MODULE_ADAPTER,
  PROVIDER_ADAPTERS,
  PROVIDER_MODULES,
  type ActiveProviderRow,
  type AdminProvider,
  type ProviderAdapter,
  type ProviderAdapterId,
  type ProviderAdapters,
  type ProviderConfig,
  type ProviderModule,
} from './types'
