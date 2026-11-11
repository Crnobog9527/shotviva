import { z } from 'zod'

import { isAllowedLink, LINK_LABEL_MAX, MESSAGE_MAX, RESHOW_DAYS_MAX } from './rules'

export const TONES = ['info', 'promo'] as const

const message = z.string().trim().min(1).max(MESSAGE_MAX)
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .default(null)
const optionalInstant = z
  .union([z.iso.datetime({ offset: true }), z.literal(''), z.null()])
  .transform((value) => (value ? value : null))
  .default(null)

// Admin save payload. The database checks the same lengths, the link shape and window order;
// this is the friendly first line.
export const announcementInputSchema = z
  .object({
    id: z.uuid().optional(),
    messageEn: message,
    messageZh: message,
    linkUrl: optionalText(500).refine((url) => url === null || isAllowedLink(url), { message: 'link' }),
    linkLabelEn: optionalText(LINK_LABEL_MAX),
    linkLabelZh: optionalText(LINK_LABEL_MAX),
    tone: z.enum(TONES),
    startsAt: optionalInstant,
    endsAt: optionalInstant,
    // Older callers (and a stale admin tab) omit these: the table's own defaults then hold.
    dismissible: z.boolean().default(true),
    reshowAfterDays: z.number().int().min(1).max(RESHOW_DAYS_MAX).nullable().default(7),
  })
  .refine((input) => !input.startsAt || !input.endsAt || Date.parse(input.startsAt) < Date.parse(input.endsAt), {
    message: 'window',
    path: ['endsAt'],
  })

export type AnnouncementInput = z.infer<typeof announcementInputSchema>

export const activationInputSchema = z.object({ id: z.uuid(), active: z.boolean() })

const rowFields = {
  id: z.uuid(),
  message_en: z.string(),
  message_zh: z.string(),
  link_url: z.string().nullable(),
  link_label_en: z.string().nullable(),
  link_label_zh: z.string().nullable(),
  tone: z.enum(TONES),
  starts_at: z.string().nullable(),
  ends_at: z.string().nullable(),
  dismissible: z.boolean(),
  reshow_after_days: z.number().int().nullable(),
}

export const bannerRowSchema = z.object(rowFields)
export const adminRowSchema = z.object({
  ...rowFields,
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
})
