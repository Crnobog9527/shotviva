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
  const inputs = { copy: values.copy, aspect_ratio: values.aspect, resolution: values.resolution, ...(note ? { note } : {}), ...toggleRequest(template.toggles, values.toggles) }
  return photos.map(({ photo, inputKey }) => ({
    templateId: template.id,
    templateName: template.name,
    resolution: values.resolution,
    aspect: values.aspect,
    credits: template.creditsCost[values.resolution],
    inputKey,
    previewUrl: photo.url,
    body: { template_id: template.id, input_key: inputKey, inputs },
  }))
}
