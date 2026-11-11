import { chosenAspect, closestResolution, templateOptions } from './output-choice'
import { allowsNoPhoto, type CatalogueTemplate } from '../catalogue/catalogue-template'
import type { StartInput } from '../generation/job-store'
import type { ReadyPhoto } from './photo-batch'
import { toggleRequest } from '../toggles'
import type { FormValues } from './workspace-form'

// One job per uploaded photo, all with the same template, size, resolution, note and toggles
// (ARCHITECTURE §6.2 "批量上传的语义", T89: one choice for the whole batch). The store adds job ids
// and batch_size.
export function startInputs(template: CatalogueTemplate, values: FormValues, photos: readonly ReadyPhoto[]): StartInput[] {
  const note = values.note.trim()
  const options = templateOptions(template)
  const resolution = closestResolution(values.resolution, options)
  if (!resolution || (template.photoInput === 'none' && photos.length)) return []
  // An explicitly photo-optional template still queues one job when the user leaves the tray empty.
  const sources = photos.length ? photos : allowsNoPhoto(template) ? [null] : []
  const perPhoto = sources.map((source) => chosenAspect(values.aspect, options, source ? source.photo.originalRatio : 1))
  if (perPhoto.some((aspect) => aspect === null)) return []
  // A batch is one size for every photo (the preflight refuses a mixed one, T107): when the
  // template cannot follow each photo's own shape, the first photo's nearest size is used.
  const aspects = sources.length > 1 ? perPhoto.map(() => perPhoto[0]!) : perPhoto
  const inputs = { copy: values.copy, resolution, ...(note ? { note } : {}), ...toggleRequest(template.toggles, values.toggles) }
  return sources.map((source, index) => {
    const inputKey = source?.inputKey ?? null
    const aspect = aspects[index]!
    return {
      templateId: template.id,
      templateName: template.name,
      resolution,
      aspect,
      credits: template.creditsCost[resolution],
      inputKey,
      previewUrl: source?.photo.url,
      body: { expected_credits: template.creditsCost[resolution], template_id: template.id, input_key: inputKey, inputs: { ...inputs, aspect_ratio: aspect } },
    }
  })
}
