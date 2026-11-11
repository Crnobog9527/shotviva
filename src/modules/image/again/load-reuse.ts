import 'server-only'

import { galleryReuseInputs } from '@/core/gallery'
import type { SiteConfig } from '@/core/config'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { againValues, type AgainStart } from './again-start'

// /generate/[templateId]?reuse=<jobId> (ARCHITECTURE §9 第 3 条): a gallery work's settings for
// this same template, with no photo (the reuser adds their own) and only its public text fields. Nothing when the gallery is
// closed or does not show the work (a plain workspace).
export async function loadReuse(site: SiteConfig, req: { jobId: string | undefined; template: CatalogueTemplate }): Promise<AgainStart | null> {
  if (!req.jobId) return null
  const inputs = await galleryReuseInputs(site, req.jobId, req.template.id)
  if (!inputs) return null
  return { jobId: req.jobId, values: { ...againValues({ ...inputs, copy: publicOnly(inputs.copy, req.template) }, req.template), note: '' }, madeAt: '', photos: [], missing: null, from: 'gallery' }
}

// Another user's text comes along only for fields the admin marked public (§5 fields.copy).
function publicOnly(copy: unknown, template: CatalogueTemplate): Record<string, unknown> {
  if (typeof copy !== 'object' || copy === null) return {}
  const shown = new Set(template.copyFields.filter((field) => field.public).map((field) => field.key))
  return Object.fromEntries(Object.entries(copy).filter(([key]) => shown.has(key)))
}
