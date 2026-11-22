import { z } from 'zod'

// Template collection share links (ARCHITECTURE §5.1g, Owner 2026-11-22). The limits are
// enforced by template_share_create (migration 1861); this copy is for the form and the tests.
// No server-only import: the Create page's selection bar reads the limits too.

export const TEMPLATE_SHARE_MAX_ITEMS = 50
export const TEMPLATE_SHARE_TITLE_MAX = 80
export const TEMPLATE_SHARE_NOTE_MAX = 500

// The link id the database makes: 12 lowercase letters and digits (the proxy lowercases paths).
const SHARE_ID = /^[a-z0-9]{12}$/
export const isTemplateShareId = (value: unknown): value is string => typeof value === 'string' && SHARE_ID.test(value)

const templateId = z.string().max(64).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
const seriesId = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)

export const templateShareItemSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('template'), id: templateId }),
  z.strictObject({ type: z.literal('series'), id: seriesId }),
])
export type TemplateShareItem = z.infer<typeof templateShareItemSchema>

const optionalText = (max: number) =>
  z.string().max(max * 2).transform((value) => value.trim()).pipe(z.string().max(max)).optional()

export const templateShareInputSchema = z.strictObject({
  items: z
    .array(templateShareItemSchema)
    .min(1)
    .max(TEMPLATE_SHARE_MAX_ITEMS)
    .refine((items) => new Set(items.map(itemKey)).size === items.length, 'duplicate item'),
  title: optionalText(TEMPLATE_SHARE_TITLE_MAX),
  note: optionalText(TEMPLATE_SHARE_NOTE_MAX),
})
export type TemplateShareInput = z.infer<typeof templateShareInputSchema>

export const itemKey = (item: TemplateShareItem) => `${item.type}:${item.id}`

// The share page's path, before the language prefix.
export const templateSharePath = (id: string) => `/s/t/${id}`
