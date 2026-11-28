import type { CreditPool } from '@/core/billing/pools'
import type { Job, JobVisibility } from '@/core/jobs'
import { isCutOut } from '@/core/jobs/job-cut-out'
import { tileUrlFor } from '@/core/jobs/job-view'
import { OUTPUT_ASPECTS, RESOLUTIONS, type OutputAspect, type Resolution } from '@/core/templates/output-options'
import type { Translate } from '@/core/translate'

import { sizeLabel, tierName } from '../workspace/workspace-options'
import { dayKeyIn } from './batch-groups'

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
  // A poster work (gallery-excluded, §9 第 7 条): private even when free; its edits are too.
  privateOnly?: boolean
  fileUrl: string | null
  // The small copy Photos' grid shows (ARCHITECTURE §8.3「作品小图」, the tile): the thumbnail route,
  // or for Photos' first screen a signed URL of the copy itself. Null like fileUrl while the job runs.
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
    privateOnly: job.galleryExcluded ?? false,
    fileUrl,
    thumbUrl: fileUrl ? (signedThumb ?? tileUrlFor(job.id)) : null,
    transparent: isCutOut(job),
    batchId: job.batchId ?? null,
    batchPosition: batchPosition(job.inputs.batch_position),
  }
}

function batchPosition(value: unknown): number | null {
  const position = typeof value === 'string' ? Number(value) : value
  return typeof position === 'number' && Number.isInteger(position) && position >= 0 ? position : null
}

// "Banner 16:9 · HD": what a tile says under its name (the day is its section's heading).
// `t` is scoped to `app`.
export function tileMeta(item: Pick<PhotoItem, 'aspect' | 'resolution'>, t: Translate): string {
  return t('photos.tileMeta', { size: sizeLabel(item.aspect, t), tier: tierName(item.resolution, t) })
}

// "Today", "Yesterday" or the date, by the calendar day in the viewer's time zone: a day
// section's heading and a batch group's line on Photos (T107). formatDay writes an older date
// (the locale's month and day, with the year when it is not this year's).
export function doneWhen(iso: string, now: Date, timeZone: string, t: Translate, formatDay: (date: Date, sameYear: boolean) => string): string {
  const dayOf = dayKeyIn(timeZone)
  const created = new Date(iso)
  const [day, today] = [dayOf(created), dayOf(now)]
  if (day >= today) return t('photos.today')
  if (day === dayOf(new Date(now.getTime() - DAY_MS))) return t('photos.yesterday')
  return formatDay(created, day.slice(0, 4) === today.slice(0, 4))
}

const DAY_MS = 24 * 60 * 60 * 1000

// "1:1 · Standard · 2 credits" for a photo still developing.
export function runningMeta(item: Pick<PhotoItem, 'aspect' | 'resolution' | 'credits'>, t: Translate): string {
  const size = item.aspect === 'original' ? t('sizes.original') : item.aspect
  return t('photos.runningMeta', { size, tier: tierName(item.resolution, t), count: item.credits })
}
