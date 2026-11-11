import type { LocalizedTemplate } from '../templates/localize'
import { publicCopy } from './public-copy'
import type { GalleryRow } from './reads'

// What a gallery page shows of one work (ARCHITECTURE §9 第 3 条): the template's name and
// category in the page's language, the public copy fields with their labels, and whether it carries the
// watermark. A work whose template is no longer on sale is not shown: "make one like this" could
// not open it.
export type GalleryWorkView = {
  id: string
  templateId: string
  templateName: string
  category: string
  copy: { label: string; value: string }[]
  watermarked: boolean
}

export function galleryWorkView(row: GalleryRow, catalogue: readonly LocalizedTemplate[]): GalleryWorkView | null {
  const template = catalogue.find((entry) => entry.id === row.templateId)
  if (!template) return null
  // Only fields the admin marked public (fields.copy[].public): a user's other words stay theirs.
  const labels = new Map(template.fields.copy.filter((field) => field.public).map((field) => [field.key, field.label]))
  return {
    id: row.id,
    templateId: template.id,
    templateName: template.name,
    category: template.category,
    copy: publicCopy(row).flatMap((field) => {
      const label = labels.get(field.key)
      return label ? [{ label, value: field.value }] : []
    }),
    watermarked: row.creditPool === 'free',
  }
}
