import type { ImageCapabilities, EstimatedImageCosts } from '../templates/image-capabilities'
import type { OpenRouterImageParameters } from './openrouter-catalog'
import type { Resolution } from '../templates/output-options'
import type { GenerationProvider, ProviderPrices } from '../jobs'

// Provider settings (ARCHITECTURE §3.3). Mirrors the checks on public.ai_providers.

// 'decision' classifies what an edit instruction changes (ARCHITECTURE §5.2, T30).
export const PROVIDER_MODULES = ['image', 'decision'] as const
export type ProviderModule = (typeof PROVIDER_MODULES)[number]

// Code adapters a row can name. A vendor with a different API shape is a new adapter (code),
// not an admin setting.
export const PROVIDER_ADAPTERS = ['openai_images', 'openrouter_images', 'openai_responses'] as const
export type ProviderAdapterId = (typeof PROVIDER_ADAPTERS)[number]

export const MODULE_ADAPTERS: Record<ProviderModule, readonly ProviderAdapterId[]> = {
  image: ['openai_images', 'openrouter_images'],
  decision: ['openai_responses'],
}

// Default for new rows.
export const MODULE_ADAPTER: Record<ProviderModule, ProviderAdapterId> = {
  image: 'openai_images',
  decision: 'openai_responses',
}

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
export const DEFAULT_BASE_URL = 'https://api.openai.com/v1'

// What an adapter needs to call its vendor. The key is plaintext, read from Vault per request:
// never keep, log or return it.
export type ProviderConfig = { baseUrl: string; model: string; apiKey: string; resolutions?: readonly Resolution[]; imageParameters?: OpenRouterImageParameters }

export type ProviderAdapter = (config: ProviderConfig) => GenerationProvider

// Registered by the module that owns the adapters (modules/image); core cannot import modules.
export type ProviderAdapters = Partial<Record<ProviderAdapterId, ProviderAdapter>>

// A row as the admin page sees it. The key itself stays in Vault; null last4 means no key.
export type AdminProvider = {
  id: string
  module: ProviderModule
  adapter: ProviderAdapterId
  label: string
  baseUrl: string
  resolutions: Resolution[]
  capabilities?: ImageCapabilities | null
  estimatedImageCosts?: EstimatedImageCosts
  model: string
  apiKeyLast4: string | null
  isActive: boolean
  notes: string | null
  // Per-million-token prices (T33); a null one is flagged on the admin page.
  prices: ProviderPrices
  updatedAt: string
}

// The active row, as generation needs it. Plain data with no key, so it can be cached; the key
// is read from Vault by id on each request.
export type ActiveProviderRow = {
  id: string
  adapter: ProviderAdapterId
  baseUrl: string
  resolutions: Resolution[]
  capabilities?: ImageCapabilities | null
  estimatedImageCosts?: EstimatedImageCosts
  model: string
  // Snapshot used to cost each job (T33). Cached with the row; a save expires the tag.
  prices: ProviderPrices
}
