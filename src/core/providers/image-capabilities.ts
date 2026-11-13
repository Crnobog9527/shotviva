import { OPENAI_MAX_REFERENCES, imageCapabilitiesSchema, type ImageCapabilities } from '../templates/image-capabilities'
import { availableImageOptions, FULL_IMAGE_OPTIONS } from '../templates/image-options'
import { RESOLUTIONS } from '../templates/output-options'
import { catalogImageEstimates } from './openrouter-pricing'
import { openRouterCatalogPricing, openRouterImageParameters, type OpenRouterImageParameters } from './openrouter-catalog'
import { OPENROUTER_IMAGE_SIZE } from './openrouter-input'
import { ARK_MAX_REFERENCES, ARK_RESOLUTIONS } from './ark'
import { ProviderSettingError } from './setting-error'
import type { ProviderAdapterId } from './types'

export function catalogCapabilities(parameters: OpenRouterImageParameters, fetchedAt: string): ImageCapabilities {
  // Models with no resolution parameter produce a single native size (the site's standard tier).
  const tiers = parameters.resolution?.values
  const resolutions = tiers
    ? RESOLUTIONS.filter((tier) => tiers.includes(OPENROUTER_IMAGE_SIZE[tier]))
    : ['1k' as const]
  const ratios = parameters.aspect_ratio?.values ?? []
  const providerAspectRatios = ratios.filter((ratio) => /^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(ratio))
  const parsed = imageCapabilitiesSchema.safeParse({
    resolutions, originalRatio: ratios.includes('auto'), providerAspectRatios,
    aspectRatios: availableImageOptions(FULL_IMAGE_OPTIONS, providerAspectRatios).aspectRatios,
    minReferences: parameters.input_references?.min ?? 0, maxReferences: parameters.input_references?.max ?? 0, fetchedAt,
  })
  if (!parsed.success) throw new ProviderSettingError('invalid_input', 'No supported site tier or invalid reference range')
  return parsed.data
}

export async function fetchImageCapabilities(adapter: ProviderAdapterId, baseUrl: string, model: string, fetchImpl?: typeof fetch): Promise<ImageCapabilities | null> {
  if (adapter === 'openai_responses') return null
  const fetchedAt = new Date().toISOString()
  if (adapter === 'openai_images') return {
    ...FULL_IMAGE_OPTIONS, providerAspectRatios: FULL_IMAGE_OPTIONS.aspectRatios, minReferences: 0, maxReferences: OPENAI_MAX_REFERENCES, fetchedAt,
  }
  // Ark takes any WxH within its pixel range, so every site ratio and 'original' fit; no catalogue.
  if (adapter === 'ark_images') return {
    ...FULL_IMAGE_OPTIONS, resolutions: [...ARK_RESOLUTIONS], providerAspectRatios: FULL_IMAGE_OPTIONS.aspectRatios,
    minReferences: 0, maxReferences: ARK_MAX_REFERENCES, fetchedAt,
  }
  const parameters = await openRouterImageParameters(baseUrl, model, fetchImpl)
  const caps = catalogCapabilities(parameters, fetchedAt)
  const catalogPricing = await openRouterCatalogPricing(baseUrl, model, fetchImpl)
  return { ...caps, catalogVersion: 1 as const, catalogPricing, catalogImageCosts: catalogImageEstimates(catalogPricing, caps) }
}
