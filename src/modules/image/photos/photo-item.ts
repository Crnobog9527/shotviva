import type { CreditPool } from '@/core/billing/pools'
import type { Job, JobVisibility } from '@/core/jobs'
import { isCutOut } from '@/core/jobs/job-cut-out'
import { thumbUrlFor } from '@/core/jobs/job-view'
import { OUTPUT_ASPECTS, RESOLUTIONS, type OutputAspect, type Resolution } from '@/core/templates/output-options'
import type { Translate } from '@/core/translate'

import { sizeLabel, tierName } from '../workspace/workspace-options'

// One row of Photos, plain data for client components. Built from the job row plus its
// template's name and cover (a running job has no output to show yet).
export type PhotoItem = {
  id: string
  templateId: string
  templateName: string
  cover: string | null
  aspect: OutputAspect
  resolution: Resolution
  credits: number
  createdAt: string
  creditPool: CreditPool
  visibility: JobVisibility
  fileUrl: string | null
  // The small copy lists show (ARCHITECTURE §8.3「作品小图」): the thumbnail route, or for Photos'
  // first screen a signed URL of the copy itself. Null like fileUrl while the job runs.
  thumbUrl: string | null
  // A cut-out (transparent background): downloads offer 白底 / 透明底. null when unknown.
  transparent?: boolean | null
  // The preflighted batch it came from (T107): Photos groups a batch and offers its ZIP.
  batchId: string | null
  // Its cell in that batch, 0 first (inputs.batch_position); null outside a batch.
  batchPosition: number | null
}

export type TemplateLookup = Map<string, { name: string; cover: string | null }>

const pick = <T extends string>(allowed: readonly T[], value: unknown, fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback

// fallbackName names a job whose template is gone or partner-only (app.photos.fallbackName).
// signedThumb: the small copy's signed URL when the page already has one (Photos' first screen).
export function toPhotoItem(job: Job, templates: TemplateLookup, fileUrl: string | null, fallbackName = '', signedThumb?: string): PhotoItem {
  const template = templates.get(job.templateId)
  return {
    id: job.id,
    templateId: job.templateId,
    templateName: template?.name ?? fallbackName,
    cover: template?.cover ?? null,
    aspect: pick(OUTPUT_ASPECTS, job.inputs.aspect_ratio, 'original'),
    resolution: pick(RESOLUTIONS, job.inputs.resolution, '1k'),
    credits: job.creditsCost,
    createdAt: job.createdAt.toISOString(),
    creditPool: job.creditPool,
    visibility: job.visibility,
    fileUrl,
    thumbUrl: fileUrl ? (signedThumb ?? thumbUrlFor(job.id)) : null,
    transparent: isCutOut(job),
    batchId: job.batchId ?? null,
    batchPosition: batchPosition(job.inputs.batch_position),
  }
}

function batchPosition(value: unknown): number | null {
  const position = typeof value === 'string' ? Number(value) : value
  return typeof position === 'number' && Number.isInteger(position) && position >= 0 ? position : null
}

const DAY_MS = 24 * 60 * 60 * 1000
const dayKey = (date: Date) => Math.floor(date.getTime() / DAY_MS)

// "Today · Banner 16:9 · HD" (B comp photos.html). Days are counted in UTC on the server; older
// dates come from formatDay (the locale's short month and day). `t` is scoped to `app`.
export function doneMeta(
  item: Pick<PhotoItem, 'createdAt' | 'aspect' | 'resolution'>,
  now: Date,
  t: Translate,
  formatDay: (date: Date) => string,
): string {
  return t('photos.doneMeta', { when: doneWhen(item, now, t, formatDay), size: sizeLabel(item.aspect, t), tier: tierName(item.resolution, t) })
}

// "Today", "Yesterday" or the short date: a batch group's line on Photos (T107).
export function doneWhen(item: Pick<PhotoItem, 'createdAt'>, now: Date, t: Translate, formatDay: (date: Date) => string): string {
  const created = new Date(item.createdAt)
  const days = dayKey(now) - dayKey(created)
  return days <= 0 ? t('photos.today') : days === 1 ? t('photos.yesterday') : formatDay(created)
}

// "1:1 · Standard · 2 credits" for a photo still developing.
export function runningMeta(item: Pick<PhotoItem, 'aspect' | 'resolution' | 'credits'>, t: Translate): string {
  const size = item.aspect === 'original' ? t('sizes.original') : item.aspect
  return t('photos.runningMeta', { size, tier: tierName(item.resolution, t), count: item.credits })
}
