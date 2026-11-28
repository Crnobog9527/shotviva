import type { Job } from '@/core/jobs'
import type { CompanyPhoto } from '@/core/org/works'
import { OUTPUT_ASPECTS } from '@/core/templates/output-options'

import { toPhotoItem, type PhotoItem, type TemplateLookup } from '../photo-item'

// Photos' company view (ARCHITECTURE §6.5「作品页就是企业作品」): the rows of the whole company's
// works turned into the grid's items, in the order they were read. The reader's own works are
// built from their full job rows, so they behave as on the personal page; a colleague's work is a
// reduced item: it opens in the company viewer (view and download), never in the reader's own.

// Who made a colleague's work, for its viewer: an account label, or a deleted account.
export type Maker = { who: string | null; state: 'active' | 'removed' | 'deleted' }

export const orgFileUrl = (id: string, query = '') => `/api/account/enterprise/works/${id}${query}`

type Deps = {
  me: string
  // The reader's own works among the rows, read in full (ownJobsByIds).
  own: ReadonlyMap<string, Job>
  templates: TemplateLookup
  labels: ReadonlyMap<string, string | null>
  fallbackName: string
  fileUrlFor(id: string): string
  signed?: ReadonlyMap<string, string>
}

export function toCompanyItems(rows: readonly CompanyPhoto[], deps: Deps): PhotoItem[] {
  return rows.flatMap((row) => {
    if (row.userId === deps.me) {
      const job = deps.own.get(row.id)
      // Deleted or lost between the two reads: nothing to show.
      if (!job) return []
      return [{ ...toPhotoItem(job, deps.templates, deps.fileUrlFor(job.id), deps.fallbackName, deps.signed?.get(job.id)), personal: !row.orgWork }]
    }
    return [colleagueItem(row, deps)]
  })
}

function colleagueItem(row: CompanyPhoto, deps: Deps): PhotoItem {
  const aspect = OUTPUT_ASPECTS.find((value) => value === row.aspectRatio) ?? 'original'
  const state = row.archived || !row.userId ? 'deleted' : row.memberActive ? 'active' : 'removed'
  return {
    id: row.id,
    templateId: row.templateId,
    templateName: row.templateName ?? deps.templates.get(row.templateId)?.name ?? deps.fallbackName,
    cover: null,
    aspect,
    resolution: '1k',
    credits: 0,
    createdAt: new Date(row.createdAt).toISOString(),
    // An org work is always private; whether it carries a watermark shows in the picture.
    creditPool: 'paid',
    visibility: 'private',
    fileUrl: orgFileUrl(row.id),
    thumbUrl: orgFileUrl(row.id, '?size=thumb'),
    batchId: null,
    batchPosition: null,
    maker: { who: row.userId ? (deps.labels.get(row.userId) ?? null) : null, state },
  }
}
