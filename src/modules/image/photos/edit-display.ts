import type { Job } from '@/core/jobs'
import { EDIT_TEMPLATE_ID } from '@/core/templates/edit-params'

import type { OriginalSource } from '../detail/photo-detail'
import { toPhotoItem, type PhotoItem, type TemplateLookup } from './photo-item'

export type EditDisplay = {
  item: PhotoItem
  // The work an edit was made from, when it still exists and finished.
  source: PhotoItem | null
  // The words the edit was asked with (inputs.instruction), shown as "Your change".
  change: string | null
}

type Names = { fallback: string; edited: string; titleEdited(name: string): string }

// How the detail page names a photo (T6 comp ?edited=1): an edit of a template photo is
// "Pure White (edit)"; an edit whose source is gone, or is itself an edit, is "Edited photo".
export function editDisplay(job: Job, parent: Job | null, templates: TemplateLookup, names: Names, fileUrl: (id: string) => string): EditDisplay {
  const lookup: TemplateLookup = new Map(templates).set(EDIT_TEMPLATE_ID, { name: names.edited, cover: null })
  const source = parent?.status === 'succeeded' ? toPhotoItem(parent, lookup, fileUrl(parent.id), names.fallback) : null
  const item = toPhotoItem(job, lookup, fileUrl(job.id), names.fallback)
  if (source && source.templateId !== EDIT_TEMPLATE_ID) item.templateName = names.titleEdited(source.templateName)
  const change = typeof job.inputs.instruction === 'string' ? job.inputs.instruction : null
  return { item, source, change }
}

// An edit's "Original" view is the work it was edited from, while that still exists.
export function editOriginal(source: PhotoItem | null): OriginalSource {
  return source?.fileUrl ? { kind: 'source', url: source.fileUrl } : { kind: 'deleted' }
}
