import { FULL_IMAGE_OPTIONS, type ImageOptions } from '@/core/templates/image-options'
import { RESOLUTIONS, type OutputAspect, type Resolution } from '@/core/templates/output-options'

type FixedRatio = Exclude<OutputAspect, 'original'>

function numericRatio(aspect: OutputAspect) {
  const [width, height] = aspect.split(':').map(Number)
  return width! / height!
}

// Compare relative differences, so rotating both the original and all candidate sizes
// gives the same match. Never round the original to a standard ratio before comparing.
export function closestAspect(ratio: number | null | undefined, options: ImageOptions): FixedRatio | null {
  if (!ratio || ratio <= 0 || !Number.isFinite(ratio)) return null
  const fixed = options.aspectRatios.filter((aspect): aspect is FixedRatio => aspect !== 'original')
  return fixed.reduce<FixedRatio | null>((best, aspect) => {
    const distance = (value: FixedRatio) => Math.abs(Math.log(numericRatio(value) / ratio))
    return best === null || distance(aspect) < distance(best) ? aspect : best
  }, null)
}

// 'original' stays a user preference: when auto isn't supported, a photo gets its nearest
// concrete ratio (a batch uses its first photo's for all, batch-request.ts). With no decodable photo the user can still choose any fixed size.
export function chosenAspect(wanted: OutputAspect, options: ImageOptions, photoRatio?: number | null): OutputAspect | null {
  if (wanted === 'original') return options.originalRatio ? 'original' : closestAspect(photoRatio, options)
  if (options.aspectRatios.includes(wanted)) return wanted
  return closestAspect(numericRatio(wanted), options) ?? (options.originalRatio ? 'original' : null)
}

export function closestResolution(wanted: Resolution, options: ImageOptions): Resolution | null {
  const distance = (tier: Resolution) => Math.abs(RESOLUTIONS.indexOf(tier) - RESOLUTIONS.indexOf(wanted))
  return RESOLUTIONS.filter((tier) => options.resolutions.includes(tier)).reduce<Resolution | null>(
    (best, tier) => best === null || distance(tier) < distance(best) ? tier : best, null,
  )
}

// A slot template offers no "as shot" size (§5.1e): its images are a logo and the like, not a
// photo whose shape the result should follow. The server refuses it too.
export function templateOptions(template: { imageOptions?: ImageOptions; imageSlots?: readonly unknown[] } | null) {
  const options = template?.imageOptions ?? FULL_IMAGE_OPTIONS
  return template?.imageSlots?.length ? { ...options, originalRatio: false } : options
}

export function hasOutputOptions(options: ImageOptions) {
  return options.resolutions.length > 0 && (options.originalRatio || options.aspectRatios.length > 0)
}

// An unavailable fixed choice from an older work/draft is replaced immediately. Keep
// 'original' as the UI choice even when it resolves to a concrete, per-photo ratio.
export function selectedAspect(wanted: OutputAspect, options: ImageOptions) {
  return wanted === 'original' ? wanted : chosenAspect(wanted, options) ?? wanted
}
