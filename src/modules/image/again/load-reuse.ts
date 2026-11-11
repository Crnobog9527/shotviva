import 'server-only'

import { galleryReuseInputs } from '@/core/gallery'
import type { SiteConfig } from '@/core/config'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { againValues, type AgainStart } from './again-start'

// /generate/[templateId]?reuse=<jobId> (ARCHITECTURE §9 第 3 条): a gallery work's settings for
// this same template, with no photo: the reuser adds their own. Nothing when the gallery is
// closed or does not show the work (a plain workspace).
export async function loadReuse(site: SiteConfig, req: { jobId: string | undefined; template: CatalogueTemplate }): Promise<AgainStart | null> {
  if (!req.jobId) return null
  const inputs = await galleryReuseInputs(site, req.jobId, req.template.id)
  if (!inputs) return null
  return { jobId: req.jobId, values: { ...againValues(inputs, req.template), note: '' }, madeAt: '', photos: [], missing: null, from: 'gallery' }
}
