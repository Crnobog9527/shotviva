import { z } from 'zod'

import { RESOLUTIONS } from './output-options'
import { styleRefsSchema } from './style-refs'
import { creditsCostSchema, TEMPLATE_QUALITIES } from './pricing'
import { RESERVED_KEYS, toggleFieldSchema, TOGGLES_MAX } from './toggles'
import { copyFieldSchema } from './copy-fields'
import { posterFieldsSchema } from '../poster/template'

// Template shapes shared by the admin page, the import script and (later) generation.
// No `server-only` here: scripts/import-prompts.ts validates with the same schema.

export const TEMPLATE_SURFACES = ['web', 'partner'] as const
export type TemplateSurface = (typeof TEMPLATE_SURFACES)[number]

export const TEMPLATE_MODULES = ['image', 'video'] as const

// How a template card shows itself (ARCHITECTURE §8.3): still before/after, animated WebP, MP4.
export const COVER_MEDIA_TYPES = ['image', 'animated', 'video'] as const
export type CoverMediaType = (typeof COVER_MEDIA_TYPES)[number]

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'lowercase letters, digits and dashes')

export const templateFieldsSchema = z
  .object({
    images: z.object({ min: z.number().int().min(0).max(4), max: z.number().int().min(0).max(4) }),
    copy: z.array(copyFieldSchema).max(10).default([]),
    aspectRatios: z.array(z.string().regex(/^\d{1,2}:\d{1,2}$/)).min(1),
    // Optional on/off choices (T89), off by default; their prompt text is private.
    toggles: z.array(toggleFieldSchema).max(TOGGLES_MAX).default([]),
    // A dense-text poster template (ARCHITECTURE §5.3): its text comes from the confirmed content
    // blocks, never from copy fields, and it makes one or more posters per set.
    poster: posterFieldsSchema.optional(),
  })
  .refine((fields) => !fields.poster || fields.copy.length === 0, {
    message: 'a poster template takes its text from the content blocks, not from copy fields',
    path: ['poster'],
  })
  .refine((fields) => fields.images.min <= fields.images.max, {
    message: 'images.min must not exceed images.max',
    path: ['images'],
  })
  .refine((fields) => new Set(fields.copy.map((field) => field.key)).size === fields.copy.length, {
    message: 'copy field keys must be unique',
    path: ['copy'],
  })
  // One placeholder namespace: {{key}} is either a copy field or a toggle, never both.
  .refine((fields) => {
    const keys = [...fields.copy.map((field) => field.key), ...fields.toggles.map((toggle) => toggle.key)]
    const reserved = keys.some((key) => (RESERVED_KEYS as readonly string[]).includes(key))
    return new Set(keys).size === keys.length && !reserved
  }, {
    message: 'copy and toggle keys must be unique and differ from reserved placeholders',
    path: ['toggles'],
  })

export type TemplateFields = z.infer<typeof templateFieldsSchema>
// templates.fields as stored: rows written before T89 have no `toggles`, and copy fields written
// before field types have no `type` / `public` (toTemplate fills the defaults: [] / 'short' / false).
type StoredCopyField = Omit<TemplateFields['copy'][number], 'type' | 'public'> & Partial<Pick<TemplateFields['copy'][number], 'type' | 'public'>>
export type StoredTemplateFields = Omit<TemplateFields, 'toggles' | 'copy'> & { toggles?: TemplateFields['toggles']; copy: StoredCopyField[] }

const optionalUrl = z.union([z.url(), z.literal('')]).optional()

// Blank inputs mean "not translated": they are dropped, so the English text shows instead.
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((text) => text || undefined)

// templates.description (T52, ARCHITECTURE §5), also the table check.
export const TEMPLATE_DESCRIPTION_MAX = 160

// templates.translations (ARCHITECTURE §5): display text per extra language, English stays in
// `name` / `fields`. Keys are the enabled languages only (the table check says the same).
// A toggle's confirm dialog in another language (T89): each line falls back to English.
const confirmTranslationSchema = z.object({
  title: optionalText(80),
  body: optionalText(1200),
  checkbox: optionalText(120),
  accept: optionalText(40),
})

export const templateTranslationSchema = z.object({
  name: optionalText(120),
  description: optionalText(300),
  // Copy fields use label / placeholder / help / options (a choice field's English value → its
  // label here); toggles label / hint / confirm (same key namespace).
  fields: z
    .record(
      z.string().regex(/^[a-z][a-z0-9_]*$/),
      z.object({
        label: optionalText(60), placeholder: optionalText(200), help: optionalText(200), hint: optionalText(200),
        confirm: confirmTranslationSchema.optional(),
        options: z.record(z.string().max(60), optionalText(60)).optional(),
      }),
    )
    .optional(),
})
export type ConfirmTranslation = { title?: string; body?: string; checkbox?: string; accept?: string }
// Stored shape: every item optional, a missing one falls back to English.
export type TemplateTranslation = {
  name?: string
  description?: string
  fields?: Record<string, { label?: string; placeholder?: string; help?: string; hint?: string; confirm?: ConfirmTranslation; options?: Record<string, string | undefined> }>
}

export const templateTranslationsSchema = z.strictObject({ zh: templateTranslationSchema.optional() })
export type TemplateTranslations = { zh?: TemplateTranslation }

// Public, catalogue-facing part of a template (the `templates` row). Covers are optional and
// left out by the editor (the cover upload writes them); an omitted cover keeps the stored one.
export const templateInputSchema = z.object({
  id: slug.max(64),
  module: z.enum(TEMPLATE_MODULES).default('image'),
  name: z.string().trim().min(1).max(120),
  // English one-liner (T52). The editor always sends it (blank clears it, to null); the prompt
  // import script sends none, so a re-import keeps it.
  description: z
    .string()
    .trim()
    .max(TEMPLATE_DESCRIPTION_MAX)
    .nullable()
    .optional()
    .transform((text) => (text === undefined ? undefined : text || null)),
  category: z.string().trim().min(1).max(60),
  coverBeforeUrl: optionalUrl,
  coverAfterUrl: optionalUrl,
  fields: templateFieldsSchema,
  quality: z.enum(TEMPLATE_QUALITIES).default('high'),
  // Per-resolution price; the admin save also checks it against the floor (modules/image).
  creditsCost: creditsCostSchema,
  unpricedResolutions: z.array(z.enum(RESOLUTIONS)).max(3).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  visibleIn: z
    .array(z.enum(TEMPLATE_SURFACES))
    .min(1)
    .transform((surfaces) => [...new Set(surfaces)]),
  // Optional: the prompt import script sends none, so a re-import keeps what the editor wrote.
  translations: templateTranslationsSchema.optional(),
})

export type TemplateInput = z.infer<typeof templateInputSchema>

// Private part (the `template_prompts` row). Never sent to non-admin clients.
export const promptInputSchema = z.object({
  styleRefs: styleRefsSchema.optional(),
  providerId: z.uuid().nullable().optional(),
  body: z.string().min(1).max(20000),
  modelParams: z.record(z.string(), z.unknown()).default({}),
})

export type PromptInput = z.infer<typeof promptInputSchema>

export const templateWithPromptSchema = templateInputSchema.extend({ prompt: promptInputSchema })
