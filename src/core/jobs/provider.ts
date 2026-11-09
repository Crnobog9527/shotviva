import type { Resolution } from '../templates/output-options'
import type { TemplateQuality } from '../templates/pricing'

// Provider adapter contract (ARCHITECTURE §3.1). Modules implement it; core only calls it,
// so the generation pipeline never imports a module. v1 is synchronous only.

// Pixel size of the image as sent, so an 'original' output can follow the photo's ratio.
export type ProviderImage = { bytes: Uint8Array; contentType: string; width?: number; height?: number }

export type ProviderInput = {
  // Rendered wrapped prompt. Adapters must never log it (AGENTS §4, T4 card).
  prompt: string
  images: ProviderImage[]
  // Style-only requests have no source photo to determine the original output ratio.
  photoCount?: number
  // A width:height ratio, or 'original' to follow the first image (square without one).
  aspectRatio: string
  // Output tier; the adapter turns tier × ratio into a pixel size (ARCHITECTURE §8.1).
  resolution: Resolution
  // The template's quality tier, which its price assumes.
  quality: TemplateQuality
  // template_prompts.model_params; adapters pick the keys they understand.
  params: Record<string, unknown>
  signal: AbortSignal
}

// What the provider reported using, as stored in generation_jobs.provider_usage (ARCHITECTURE §4,
// T33). A field the provider did not report is left out, never guessed; cost then stays null.
// decision_* are the photo-edit decision step's tokens (T30, §5), added by that flow.
export type ProviderUsage = {
  // Raw OpenRouter usage; cost is USD before the top-up fee.
  prompt_tokens?: number
  completion_tokens?: number
  cost?: number
  input_text_tokens?: number
  input_image_tokens?: number
  output_tokens?: number
  decision_input_tokens?: number
  decision_output_tokens?: number
}

export type ProviderOutput = { bytes: Uint8Array; contentType: 'image/png'; usage?: ProviderUsage | null }

// US dollars per million tokens, from the provider's ai_providers row (§3.3). null: not filled in.
export type ProviderPrices = {
  inputTextPerM: number | null
  inputImagePerM: number | null
  outputPerM: number | null
}

export type GenerationProvider = {
  id: string
  minReferences?: number
  maxReferences?: number
  // Price snapshot taken when the provider was resolved for this request: the row's prices with
  // empty ones filled from MODEL_PRICES; null when neither has any (the job then has no cost).
  prices?: ProviderPrices | null
  generate(input: ProviderInput): Promise<ProviderOutput>
}

// Web and admin first-generation resolve the saved provider after loading the template.
export type ImageRequestOptions = Pick<ProviderInput, 'resolution' | 'aspectRatio' | 'images'> & { styleRefCount?: number }

// Routing uses reference metadata, before any private reference bytes are fetched.
export const referenceCount = (request: ImageRequestOptions) => request.images.length + (request.styleRefCount ?? 0)

export type TemplateProvider = GenerationProvider | ((id: string | null, request: ImageRequestOptions) => Promise<GenerationProvider>)

export function resolveTemplateProvider(provider: TemplateProvider, id: string | null, request: ImageRequestOptions) {
  return typeof provider === 'function' ? provider(id, request) : provider
}

// Why a provider call failed, in the terms settlement needs. Every kind is refunded.
export type ProviderFailureKind = 'content_rejected' | 'timeout' | 'failed'

export class ProviderError extends Error {
  readonly kind: ProviderFailureKind
  // Usage the provider reported on a call that still failed (it is billed all the same).
  readonly usage: ProviderUsage | null

  constructor(kind: ProviderFailureKind, message: string, options?: { cause?: unknown; usage?: ProviderUsage | null }) {
    super(message, options)
    this.name = 'ProviderError'
    this.kind = kind
    this.usage = options?.usage ?? null
  }
}
