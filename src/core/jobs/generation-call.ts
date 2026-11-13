import 'server-only'

import type { IdentityJudge, ScreenResult } from '../identity-guard'
import { AppError } from '../errors'
import { logger } from '../logger'
import type { InputImage, ObjectStore } from '../storage'
import { providerParams, renderPrompt, toggleFragments, type GenerationInputs, type GenerationTemplate, type Resolution } from '../templates'
import { resolveTemplateProvider, type GenerationProvider, type ProviderInput, type TemplateProvider } from './provider'
import { readStyleImages } from './style-reference-images'
import type { DecisionCost } from './settle-generation'

// The provider call of a template generation (ARCHITECTURE §4): the template's wrapped prompt with
// the user's copy, toggle choices (T89) and note, their photo, the size, the template's quality
// tier and model params (without the toggle fragments, which only the prompt uses).
// A user's job and an admin test run (§10.b, T85) send exactly this; only who pays differs.
type CallTemplate = { template: Pick<GenerationTemplate['template'], 'id' | 'quality'>; prompt: GenerationTemplate['prompt'] }

// Both preflight and generation choose the route before fetching any reference bytes.
export async function selectTemplateRoute(provider: TemplateProvider, providerId: string | null,
  resolution: Resolution, aspectRatio: string, photoCount: number, styleRefCount: number, onRoute?: (provider: GenerationProvider) => void) {
  const selected = await resolveTemplateProvider(provider, providerId, { resolution, aspectRatio, referenceCount: photoCount + styleRefCount })
  onRoute?.(selected)
  const limit = selected.maxReferences ?? Infinity
  const dropRefs = styleRefCount > 0 && photoCount + styleRefCount > limit
  if (photoCount > limit) throw new AppError('REFERENCE_IMAGE_LIMIT', 'This model cannot accept the supplied photos')
  if (photoCount + (dropRefs ? 0 : styleRefCount) < (selected.minReferences ?? 0)) {
    throw new AppError('MODEL_INPUT_UNSUPPORTED', 'This model requires more input images')
  }
  return { provider: selected, dropRefs }
}

export async function templateCall(
  deps: { store: ObjectStore; provider: TemplateProvider },
  { template, prompt }: CallTemplate, inputs: GenerationInputs, image: InputImage | null,
  options: { resolution: Resolution; providerId: string | null; omitStyleRefs?: boolean; onRoute?: (provider: GenerationProvider) => void },
) {
  const photos = image ? [image] : []
  const requested = options.omitStyleRefs ? [] : prompt.styleRefs
  const { provider, dropRefs } = await selectTemplateRoute(deps.provider, options.providerId,
    options.resolution, inputs.aspectRatio, photos.length, requested.length, options.onRoute)
  if (dropRefs) {
    logger.warn('image.style_refs.omitted', {
      templateId: template.id, version: prompt.version, provider: provider.id,
      photoCount: photos.length, styleRefCount: requested.length, maxReferences: provider.maxReferences,
    })
  }
  const refs = dropRefs ? [] : requested
  const refImages = await readStyleImages(deps.store, prompt.version, refs)
  const counts = { photo_count: photos.length, style_ref_count: refs.length }
  const call: Omit<ProviderInput, 'signal'> = {
    prompt: renderPrompt(prompt.body, inputs, toggleFragments(prompt.modelParams), counts),
    images: [...photos, ...refImages],
    photoCount: photos.length,
    aspectRatio: inputs.aspectRatio,
    resolution: options.resolution,
    quality: template.quality,
    params: providerParams(prompt.modelParams),
  }
  return { provider, call, styleRefKeys: refs.map((ref) => ref.key) }
}

// The screening call's tokens join the job's usage and cost like the edit decision's (T33).
export function screenCost(judge: IdentityJudge | null | undefined, screen: ScreenResult): DecisionCost | undefined {
  if (!screen.usage) return undefined
  return {
    usage: { decision_input_tokens: screen.usage.inputTokens, decision_output_tokens: screen.usage.outputTokens },
    prices: judge?.prices ?? null,
  }
}

// Every word the user typed that reaches the image model: the template's text fields, a poster's
// confirmed text and the note.
// Toggles are not typed words (T89): their fragments are the template's own text.
export const typedWords = (inputs: GenerationInputs): string[] =>
  [...Object.values(inputs.copy), ...(inputs.posterText ? [inputs.posterText] : []), inputs.note]
