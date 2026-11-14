import { z } from 'zod'

import { POSTER_BLOCKS, POSTER_LIMITS } from './content'

// A poster template's set (templates.fields.poster, ARCHITECTURE §5.3): which posters it makes,
// which blocks each one carries and how much one poster holds before the set gets another page.
// Header and footer repeat on every poster; prizes, sections and table each belong to the first
// kind that lists them.

export const posterCapacitySchema = z.object({
  // Characters of section titles and lines on one poster.
  chars: z.number().int().min(100).max(POSTER_LIMITS.totalChars).optional(),
  prizeRows: z.number().int().min(1).max(POSTER_LIMITS.prizeRows).optional(),
  tableRows: z.number().int().min(1).max(POSTER_LIMITS.tableRows).optional(),
})

export const posterKindSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,23}$/),
  name: z.object({ en: z.string().min(1).max(40), zh: z.string().min(1).max(20) }),
  blocks: z.array(z.enum(POSTER_BLOCKS)).min(1),
  capacity: posterCapacitySchema.default({}),
  // The template's image slots (fields.images.slots) this page sends to the model, e.g. the prize
  // photo on the prize page only; every other page sends none.
  slots: z.array(z.string().regex(/^[a-z][a-z0-9_]*$/)).max(4).default([]),
})

// A spot on the poster as fractions: x of the width, y of the height (top-left corner), size of
// the width (it is square).
const spotSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), size: z.number().min(0.04).max(0.4) })

// The user's QR code (ARCHITECTURE §5.3 「二维码」): `slot` is an image slot with sendToModel
// false, sent with every page; `fallback` is where code pastes it when the model drew no
// placeholder (the footer box), per page kind where the pages differ.
export const posterQrSchema = z.object({
  slot: z.string().regex(/^[a-z][a-z0-9_]*$/),
  fallback: spotSchema,
  pages: z.record(z.string(), spotSchema).optional(),
})

export const posterFieldsSchema = z.object({
  kinds: z.array(posterKindSchema).min(1).max(4),
  // The level table's header the editor starts from; the user may rename the columns.
  tableColumns: z.array(z.string().min(1).max(POSTER_LIMITS.cell)).min(POSTER_LIMITS.tableColumns.min)
    .max(POSTER_LIMITS.tableColumns.max).optional(),
  // The sections column's heading the editor starts from (「赛事信息」 / 「INFORMATION」); editable.
  infoHeading: z.object({ title: z.string().max(12), titleEn: z.string().max(24) }).optional(),
  qr: posterQrSchema.optional(),
}).refine((poster) => new Set(poster.kinds.map((kind) => kind.key)).size === poster.kinds.length, {
  message: 'poster kind keys must be unique', path: ['kinds'],
})

export type PosterFields = z.infer<typeof posterFieldsSchema>
export type PosterKind = z.infer<typeof posterKindSchema>
export type PosterCapacity = z.infer<typeof posterCapacitySchema>
export type PosterQr = z.infer<typeof posterQrSchema>

// The QR code's fallback spot on one page.
export const qrFallbackFor = (qr: PosterQr, kind: string) => qr.pages?.[kind] ?? qr.fallback

export const CONTENT_BLOCKS = ['prizes', 'sections', 'table'] as const
export type ContentBlock = (typeof CONTENT_BLOCKS)[number]

// The kind that carries a content block, or null when the template has nowhere to put it.
export function kindFor(poster: PosterFields, block: ContentBlock): PosterKind | null {
  return poster.kinds.find((kind) => kind.blocks.includes(block)) ?? null
}
