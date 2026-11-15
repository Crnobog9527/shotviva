import { z } from 'zod'

import { FEATURED_MAX, POSTER_BLOCKS, POSTER_LIMITS, posterContentSchema } from './content'

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
  slots: z.array(z.string().regex(/^[a-z][a-z0-9_]*$/)).max(8).default([]),
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

// 展示位 (§5.3, Owner 2026-11-15): the prize page's display area draws `count` prizes as products;
// the user picks which (the top rows until they do), the rest stay text in the prize list.
// `photos`: one optional image slot per spot, in spot order (spot k ↔ photos[k-1]), listed by the
// page that carries the prizes; none: every featured prize is drawn from its name.
export const posterFeaturedSchema = z.object({
  count: z.number().int().min(1).max(FEATURED_MAX),
  photos: z.array(z.string().regex(/^[a-z][a-z0-9_]*$/)).max(FEATURED_MAX).default([]),
}).refine((featured) => featured.photos.length === 0 || featured.photos.length === featured.count, {
  message: 'poster.featured.photos needs one slot per spot (or none)', path: ['photos'],
}).refine((featured) => new Set(featured.photos).size === featured.photos.length, {
  message: 'poster.featured.photos must be different slots', path: ['photos'],
})

export const posterFieldsSchema = z.object({
  kinds: z.array(posterKindSchema).min(1).max(4),
  // The level table's header the editor starts from; the user may rename the columns.
  tableColumns: z.array(z.string().min(1).max(POSTER_LIMITS.cell)).min(POSTER_LIMITS.tableColumns.min)
    .max(POSTER_LIMITS.tableColumns.max).optional(),
  // The sections column's heading the editor starts from (「赛事信息」 / 「INFORMATION」); editable.
  infoHeading: z.object({ title: z.string().max(12), titleEn: z.string().max(24) }).optional(),
  // The cover poster's whole text (Owner 2026-11-14: users only change words, never the blocks):
  // the editor starts from it, every block, row and column filled, so nothing is built by hand.
  // Editable in the admin and synced with the template like every other field.
  sample: posterContentSchema.optional(),
  qr: posterQrSchema.optional(),
  featured: posterFeaturedSchema.optional(),
}).refine((poster) => new Set(poster.kinds.map((kind) => kind.key)).size === poster.kinds.length, {
  message: 'poster kind keys must be unique', path: ['kinds'],
}).refine((poster) => !poster.featured || poster.featured.photos.every((key) => key !== poster.qr?.slot && poster.kinds.find((kind) => kind.blocks.includes('prizes'))?.slots.includes(key)), {
  message: 'poster.featured needs a page with prizes, which lists every featured photo slot', path: ['featured'],
})

export type PosterFields = z.infer<typeof posterFieldsSchema>
export type PosterKind = z.infer<typeof posterKindSchema>
export type PosterCapacity = z.infer<typeof posterCapacitySchema>
export type PosterQr = z.infer<typeof posterQrSchema>
export type PosterFeatured = z.infer<typeof posterFeaturedSchema>

// The QR code's fallback spot on one page.
export const qrFallbackFor = (qr: PosterQr, kind: string) => qr.pages?.[kind] ?? qr.fallback

export const CONTENT_BLOCKS = ['prizes', 'sections', 'table'] as const
export type ContentBlock = (typeof CONTENT_BLOCKS)[number]

// The kind that carries a content block, or null when the template has nowhere to put it.
export function kindFor(poster: PosterFields, block: ContentBlock): PosterKind | null {
  return poster.kinds.find((kind) => kind.blocks.includes(block)) ?? null
}
