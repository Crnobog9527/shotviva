import { chosenAspect, closestResolution, templateOptions } from './output-choice'
import type { CatalogueTemplate } from '../catalogue/catalogue-template'
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
  if (!resolution) return []
  const aspects = photos.map(({ photo }) => chosenAspect(values.aspect, options, photo.originalRatio))
  if (aspects.some((aspect) => aspect === null)) return []
  const inputs = { copy: values.copy, resolution, ...(note ? { note } : {}), ...toggleRequest(template.toggles, values.toggles) }
  return photos.map(({ photo, inputKey }, index) => {
    const aspect = aspects[index]!
    return {
      templateId: template.id,
      templateName: template.name,
      resolution,
      aspect,
      credits: template.creditsCost[resolution],
      inputKey,
      previewUrl: photo.url,
      body: { template_id: template.id, input_key: inputKey, inputs: { ...inputs, aspect_ratio: aspect } },
    }
  })
}
