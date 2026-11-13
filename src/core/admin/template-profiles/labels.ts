import type { Resolution } from '@/core/templates/output-options'

import type { ImageModel, ProfileKey } from './types'

export const RESOLUTION_LABEL: Record<Resolution, string> = { '1k': '1K', '2k': '2K', '4k': '4K' }

// A profile is named by the model it is bound to (总控 2026-11-13: the art-style templates' "openai"
// profile is an OpenRouter model, not ChatGPT).
export function modelLabel(models: readonly ImageModel[], providerId: string | null, fallback: string) {
  if (!providerId) {
    const active = models.find(model => model.isActive)
    return active ? `${active.label}（默认）` : fallback
  }
  const model = models.find(item => item.id === providerId)
  return model ? model.label : fallback
}

// The models a profile may bind: Ark ones for Seedream, every other one for the ChatGPT profile.
export const modelsFor = (models: readonly ImageModel[], profile: ProfileKey) =>
  models.filter(model => (model.adapter === 'ark_images') === (profile === 'seedream'))
