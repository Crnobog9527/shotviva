import { z } from 'zod'

import { CREDIT_POOLS } from '../billing/pools'

// Work collection sharing (ARCHITECTURE §6.2「作品集分享」, migrations 1870–1871). Limits mirror the
// table's checks so a bad request fails here with a clear message before it reaches the database.
export const WORK_SHARE_MAX_WORKS = 30
export const WORK_SHARE_TITLE_MAX = 80
export const WORK_SHARE_NOTE_MAX = 500

// 32 hex characters (work_shares.id); anything else is a missing link without a database read.
export const SHARE_ID_PATTERN = /^[0-9a-f]{32}$/
export const isWorkShareId = (value: unknown): value is string => typeof value === 'string' && SHARE_ID_PATTERN.test(value)

const optionalText = (max: number) =>
  z
    .string()
    .max(max * 4)
    .transform((value) => value.trim())
    .pipe(z.string().max(max))
    .optional()

export const createShareSchema = z.object({
  jobIds: z.array(z.uuid()).min(1).max(WORK_SHARE_MAX_WORKS).refine((ids) => new Set(ids).size === ids.length, 'works repeat'),
  showBefore: z.boolean().default(false),
  title: optionalText(WORK_SHARE_TITLE_MAX),
  note: optionalText(WORK_SHARE_NOTE_MAX),
})

export type CreateShareInput = z.input<typeof createShareSchema>

const itemSchema = z.object({
  job_id: z.uuid(),
  template_id: z.string(),
  credit_pool: z.enum(CREDIT_POOLS),
  output_key: z.string().min(1),
  aspect_ratio: z.string().nullable(),
})

export const sharedRowSchema = z.object({
  id: z.string(),
  user_id: z.uuid(),
  title: z.string().nullable(),
  note: z.string().nullable(),
  show_before: z.boolean(),
  created_at: z.string(),
  ref: z.string().nullable(),
  items: z.array(itemSchema),
})

// A link as the server reads it. ownerId and outputKey stay on the server (the image routes);
// the page gets SharedWorkView, which has neither.
export type SharedItem = { jobId: string; templateId: string; creditPool: 'free' | 'paid'; outputKey: string; aspectRatio: string | null }
export type WorkShare = {
  id: string
  ownerId: string
  title: string | null
  note: string | null
  showBefore: boolean
  createdAt: Date
  ref: string | null
  items: SharedItem[]
}

export function toWorkShare(row: z.infer<typeof sharedRowSchema>): WorkShare {
  return {
    id: row.id,
    ownerId: row.user_id,
    title: row.title,
    note: row.note,
    showBefore: row.show_before,
    createdAt: new Date(row.created_at),
    ref: row.ref,
    items: row.items.map((item) => ({
      jobId: item.job_id,
      templateId: item.template_id,
      creditPool: item.credit_pool,
      outputKey: item.output_key,
      aspectRatio: item.aspect_ratio,
    })),
  }
}

export const listRowSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  show_before: z.boolean(),
  created_at: z.string(),
  revoked_at: z.string().nullable(),
  works: z.number().int(),
  cover_job_id: z.uuid().nullable(),
})

// cursor: created_at exactly as the database wrote it (microseconds), for the next page.
export type OwnShare = { id: string; title: string | null; showBefore: boolean; createdAt: Date; cursor: string; revokedAt: Date | null; works: number; coverJobId: string | null }
