import { RESOLUTIONS, type Resolution } from '@/core/templates/output-options'
import type { TemplateQuality } from '@/core/templates/pricing'

import type { BulkEditPatch } from '../templates/bulk-edit-rules'

// The batch-edit form (T79): every field starts on 「不改」. Blank credit boxes and the 不改
// choices leave that part of each template alone.
export type SurfaceChoice = '' | 'web' | 'partner' | 'both'
export type BulkEditValues = {
  credits: Record<Resolution, string>
  // 停售: tiers to close on every ticked template; its credit box is then ignored.
  closed: Record<Resolution, boolean>
  provider: string
  surfaces: SurfaceChoice
  quality: '' | TemplateQuality
  // A template_categories key (T75); '' = 不改.
  category: string
}

export const emptyBulkEdit = (): BulkEditValues => ({ credits: { '1k': '', '2k': '', '4k': '' }, closed: { '1k': false, '2k': false, '4k': false }, provider: 'keep', surfaces: '', quality: '', category: '' })

const SURFACES: Record<Exclude<SurfaceChoice, ''>, BulkEditPatch['visibleIn']> = {
  web: ['web'],
  partner: ['partner'],
  both: ['web', 'partner'],
}

export type BulkEditForm = { patch: BulkEditPatch; problems: Partial<Record<Resolution, string>> }

// Per-tier credits and their input problems (not whole numbers 1–999); a 停售 tier is skipped.
function readCredits(values: BulkEditValues) {
  const creditsCost: Partial<Record<Resolution, number>> = {}
  const problems: Partial<Record<Resolution, string>> = {}
  for (const resolution of RESOLUTIONS) {
    const text = values.credits[resolution].trim()
    if (values.closed[resolution] || text === '') continue
    if (!/^[1-9][0-9]{0,2}$/.test(text)) problems[resolution] = '填 1–999 的整数，或留空不改'
    else creditsCost[resolution] = Number(text)
  }
  return { creditsCost, problems }
}

// The patch the form asks for, and per-tier input problems.
export function readBulkEdit(values: BulkEditValues): BulkEditForm {
  const { creditsCost, problems } = readCredits(values)
  const closeResolutions = RESOLUTIONS.filter((resolution) => values.closed[resolution])
  const patch: BulkEditPatch = {
    ...(Object.keys(creditsCost).length > 0 ? { creditsCost } : {}),
    ...(closeResolutions.length > 0 ? { closeResolutions } : {}),
    ...(values.surfaces ? { visibleIn: SURFACES[values.surfaces] } : {}),
    ...(values.provider !== 'keep' && { providerId: values.provider || null }),
    ...(values.quality ? { quality: values.quality } : {}),
    ...(values.category ? { categoryKey: values.category } : {}),
  }
  return { patch, problems }
}
