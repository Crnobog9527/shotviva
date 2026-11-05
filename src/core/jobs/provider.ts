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

export type ProviderOutput = { bytes: Uint8Array; contentType: 'image/png' }

export type GenerationProvider = {
  id: string
  generate(input: ProviderInput): Promise<ProviderOutput>
}

// Why a provider call failed, in the terms settlement needs. Every kind is refunded.
export type ProviderFailureKind = 'content_rejected' | 'timeout' | 'failed'

export class ProviderError extends Error {
  readonly kind: ProviderFailureKind

  constructor(kind: ProviderFailureKind, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'ProviderError'
    this.kind = kind
  }
}
