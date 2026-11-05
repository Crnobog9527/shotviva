import type { GenerationProvider } from '../jobs'

// Provider settings (ARCHITECTURE §3.3). Mirrors the checks on public.ai_providers.

export const PROVIDER_MODULES = ['image'] as const
export type ProviderModule = (typeof PROVIDER_MODULES)[number]

// Code adapters a row can name. A vendor with a different API shape is a new adapter (code),
// not an admin setting.
export const PROVIDER_ADAPTERS = ['openai_images'] as const
export type ProviderAdapterId = (typeof PROVIDER_ADAPTERS)[number]

export const DEFAULT_BASE_URL = 'https://api.openai.com/v1'

// What an adapter needs to call its vendor. The key is plaintext: build it per request on the
// server and never keep, log or return it.
export type ProviderConfig = { baseUrl: string; model: string; apiKey: string }

export type ProviderAdapter = (config: ProviderConfig) => GenerationProvider

// Registered by the module that owns the adapters (modules/image); core cannot import modules.
export type ProviderAdapters = Partial<Record<ProviderAdapterId, ProviderAdapter>>

// A row as the admin page sees it: everything except the key ciphertext.
export type AdminProvider = {
  id: string
  module: ProviderModule
  adapter: ProviderAdapterId
  label: string
  baseUrl: string
  model: string
  apiKeyLast4: string
  isActive: boolean
  notes: string | null
  updatedAt: string
}

// The active row with its ciphertext, as generation needs it. Plain data so it can be cached.
export type ActiveProviderRow = {
  id: string
  adapter: ProviderAdapterId
  baseUrl: string
  model: string
  apiKeyCiphertext: string
}
