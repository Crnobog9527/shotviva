import type { CreditPool } from '@/core/billing/pools'
import type { Job, JobVisibility } from '@/core/jobs'
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
}

export type TemplateLookup = Map<string, { name: string; cover: string | null }>

const pick = <T extends string>(allowed: readonly T[], value: unknown, fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback

// fallbackName names a job whose template is gone or partner-only (app.photos.fallbackName).
export function toPhotoItem(job: Job, templates: TemplateLookup, fileUrl: string | null, fallbackName = ''): PhotoItem {
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
  }
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
  const created = new Date(item.createdAt)
  const days = dayKey(now) - dayKey(created)
  const when = days <= 0 ? t('photos.today') : days === 1 ? t('photos.yesterday') : formatDay(created)
  return t('photos.doneMeta', { when, size: sizeLabel(item.aspect, t), tier: tierName(item.resolution, t) })
}

// "1:1 · Standard · 2 credits" for a photo still developing.
export function runningMeta(item: Pick<PhotoItem, 'aspect' | 'resolution' | 'credits'>, t: Translate): string {
  const size = item.aspect === 'original' ? t('sizes.original') : item.aspect
  return t('photos.runningMeta', { size, tier: tierName(item.resolution, t), count: item.credits })
}
