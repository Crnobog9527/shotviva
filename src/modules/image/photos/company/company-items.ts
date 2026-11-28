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
  // The reader's own works among the rows, read in full (ownJobsByIds), and with them the rest
  // of any batch of theirs the page cut (T107): those are not among the rows.
  own: ReadonlyMap<string, Job>
  templates: TemplateLookup
  labels: ReadonlyMap<string, string | null>
  fallbackName: string
  fileUrlFor(id: string): string
  signed?: ReadonlyMap<string, string>
}

export function toCompanyItems(rows: readonly CompanyPhoto[], deps: Deps): PhotoItem[] {
  const mine = (job: Job, personal: boolean): PhotoItem => ({ ...toPhotoItem(job, deps.templates, deps.fileUrlFor(job.id), deps.fallbackName, deps.signed?.get(job.id)), personal })
  const listed = new Set<string>()
  // A batch is paid one way: its photos off the page are personal when the ones on it are.
  const batchPersonal = new Map<string, boolean>()
  const items = rows.flatMap((row) => {
    if (row.userId !== deps.me) return [colleagueItem(row, deps)]
    const job = deps.own.get(row.id)
    // Deleted or lost between the two reads: nothing to show.
    if (!job) return []
    listed.add(job.id)
    if (job.batchId) batchPersonal.set(job.batchId, !row.orgWork)
    return [mine(job, !row.orgWork)]
  })
  // The rest of a cut batch: Photos gathers a batch where its first listed photo stands
  // (batch-groups.ts), so where these come in the list does not matter.
  const rest = [...deps.own.values()].filter((job) => !listed.has(job.id) && job.batchId && batchPersonal.has(job.batchId))
  return [...items, ...rest.map((job) => mine(job, batchPersonal.get(job.batchId!) ?? false))]
}

function makerOf(row: CompanyPhoto, labels: Deps['labels']): Maker {
  if (row.archived || !row.userId) return { who: null, state: 'deleted' }
  return { who: labels.get(row.userId) ?? null, state: row.memberActive ? 'active' : 'removed' }
}

function colleagueItem(row: CompanyPhoto, deps: Deps): PhotoItem {
  const aspect = OUTPUT_ASPECTS.find((value) => value === row.aspectRatio) ?? 'original'
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
    // Photos' tile copy: signed straight to storage for the first screen, else through the route.
    thumbUrl: deps.signed?.get(row.id) ?? orgFileUrl(row.id, '?size=tile'),
    batchId: null,
    batchPosition: null,
    maker: makerOf(row, deps.labels),
  }
}
