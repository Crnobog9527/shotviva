import { OPENAI_MAX_REFERENCES, imageCapabilitiesSchema, type ImageCapabilities } from '../templates/image-capabilities'
import { availableImageOptions, FULL_IMAGE_OPTIONS, PROVIDER_ASPECTS } from '../templates/image-options'
import type { Resolution } from '../templates/output-options'
import { catalogImageEstimates } from './openrouter-pricing'
import { openRouterCatalogPricing, openRouterImageParameters, type OpenRouterImageParameters } from './openrouter-catalog'
import { openRouterPixelSize, openRouterTiers } from './openrouter-input'
import { ARK_MAX_REFERENCES, ARK_RESOLUTIONS } from './ark'
import { ProviderSettingError } from './setting-error'
import { decideTiers, openAIImageTiers, type TierDecision } from './tier-support'
import type { ProviderAdapterId } from './types'

export function catalogCapabilities(model: string, parameters: OpenRouterImageParameters, fetchedAt: string): ImageCapabilities {
  const resolutions = openRouterTiers(model, parameters)
  const pixelSize = openRouterPixelSize(model, parameters)
  const ratios = parameters.aspect_ratio?.values ?? []
  // A pixel size carries any site ratio, and 'original' follows the photo, as on the official line.
  const providerAspectRatios = pixelSize ? PROVIDER_ASPECTS : ratios.filter((ratio) => /^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(ratio))
  const parsed = imageCapabilitiesSchema.safeParse({
    resolutions, originalRatio: pixelSize || ratios.includes('auto'), providerAspectRatios,
    aspectRatios: availableImageOptions({ ...FULL_IMAGE_OPTIONS, aspectRatios: PROVIDER_ASPECTS }, providerAspectRatios).aspectRatios,
    minReferences: parameters.input_references?.min ?? 0, maxReferences: parameters.input_references?.max ?? 0, fetchedAt,
  })
  if (!parsed.success) throw new ProviderSettingError('invalid_input', 'No supported site tier or invalid reference range')
  return parsed.data
}

function withTiers(caps: ImageCapabilities, decision: TierDecision | null): ImageCapabilities {
  if (!decision) throw new ProviderSettingError('invalid_input', 'At least one supported tier must stay on')
  const next: ImageCapabilities = { ...caps, resolutions: decision.resolutions, resolutionSource: decision.source }
  delete next.resolutionLimit
  return decision.limit ? { ...next, resolutionLimit: decision.limit } : next
}

// `choice`: the tiers an admin picked in the form, or the stored resolutionLimit on a refresh, so
// a narrower choice (or an unknown model's declaration) survives the daily refresh.
export async function fetchImageCapabilities(adapter: ProviderAdapterId, baseUrl: string, model: string, fetchImpl?: typeof fetch,
  choice?: readonly Resolution[] | null): Promise<ImageCapabilities | null> {
  if (adapter === 'openai_responses') return null
  const fetchedAt = new Date().toISOString()
  if (adapter === 'openai_images') {
    const spec = openAIImageTiers(model)
    const caps: ImageCapabilities = {
      ...FULL_IMAGE_OPTIONS, aspectRatios: PROVIDER_ASPECTS, providerAspectRatios: PROVIDER_ASPECTS, minReferences: 0, maxReferences: OPENAI_MAX_REFERENCES, fetchedAt,
    }
    return withTiers(caps, decideTiers(spec.tiers, spec.known ? 'spec' : 'unknown', choice))
  }
  // Ark takes any WxH within its pixel range, so every site ratio and 'original' fit; no catalogue.
  if (adapter === 'ark_images') {
    const caps: ImageCapabilities = {
      ...FULL_IMAGE_OPTIONS, providerAspectRatios: FULL_IMAGE_OPTIONS.aspectRatios, minReferences: 0, maxReferences: ARK_MAX_REFERENCES, fetchedAt,
    }
    return withTiers(caps, decideTiers(ARK_RESOLUTIONS, 'spec', choice))
  }
  const parameters = await openRouterImageParameters(baseUrl, model, fetchImpl)
  const detected = catalogCapabilities(model, parameters, fetchedAt)
  const caps = withTiers(detected, decideTiers(detected.resolutions, 'catalog', choice))
  const catalogPricing = await openRouterCatalogPricing(baseUrl, model, fetchImpl)
  return { ...caps, catalogVersion: 1 as const, catalogPricing, catalogImageCosts: catalogImageEstimates(catalogPricing, caps, model) }
}
