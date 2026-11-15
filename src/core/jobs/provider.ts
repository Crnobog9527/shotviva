import type { ProviderUsage } from './provider-usage'
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
  // Preserve billing evidence when the generation deadline wins before the adapter returns.
  noteUsage?(usage: ProviderUsage): void
  signal: AbortSignal
}

export type { ProviderUsage } from './provider-usage'

export type ProviderOutput = { bytes: Uint8Array; contentType: 'image/png'; usage?: ProviderUsage | null }

// US dollars per million tokens, from the provider's ai_providers row (§3.3). null: not filled in.
export type ProviderPrices = {
  inputTextPerM: number | null
  inputImagePerM: number | null
  outputPerM: number | null
}

export type GenerationProvider = {
  id: string
  fallbackReason?: string
  minReferences?: number
  maxReferences?: number
  // Price snapshot taken when the provider was resolved for this request: the live catalogue price,
  // empty fields filled from the row's own; null when neither has any (the job then has no cost).
  prices?: ProviderPrices | null
  // true: the adapter sends model_params.background to the model, so a transparent template's
  // result really is a cut-out (OpenAI images, Ark). OpenRouter sends it only when the model lists
  // that value, so its results stay unknown. Settle flattens any alpha a template did not ask for.
  honoursBackground?: boolean
  // Optional: whether the model takes this request (OpenRouter checks its catalogue entry). A call
  // that code rebuilt after routing (a food flow, §5.1c) is checked here before it is sent.
  accepts?(request: ImageRequestOptions): boolean
  // Optional bounded, read-only invoice lookup after the generation deadline has stopped.
  completeUsage?(usage: ProviderUsage): Promise<ProviderUsage>
  generate(input: ProviderInput): Promise<ProviderOutput>
}

// Web and admin first-generation resolve the saved provider after loading the template.
// Routing requires the number of references, never the uploaded image bytes.
// tierFallback: a size the routed line does not offer falls back to the default line instead of
// being refused. Only an edit asks for it: its size follows the source work, which the bound line's
// options never narrowed (a template's own sizes do).
export type ImageRequestOptions = Pick<ProviderInput, 'resolution' | 'aspectRatio'> & { referenceCount: number; tierFallback?: boolean }

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
