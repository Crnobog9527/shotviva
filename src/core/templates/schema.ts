import { z } from 'zod'

import { creditsCostSchema, TEMPLATE_QUALITIES } from './pricing'

// Template shapes shared by the admin page, the import script and (later) generation.
// No `server-only` here: scripts/import-prompts.ts validates with the same schema.

export const TEMPLATE_SURFACES = ['web', 'partner'] as const
export type TemplateSurface = (typeof TEMPLATE_SURFACES)[number]

export const TEMPLATE_MODULES = ['image', 'video'] as const

// How a template card shows itself (ARCHITECTURE §8.3): still before/after, animated WebP, MP4.
export const COVER_MEDIA_TYPES = ['image', 'animated', 'video'] as const
export type CoverMediaType = (typeof COVER_MEDIA_TYPES)[number]

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'lowercase letters, digits and dashes')

export const copyFieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: z.string().min(1).max(60),
  // Hint inside the empty input; optional in every language (ARCHITECTURE §5).
  placeholder: z.string().max(200).optional(),
  required: z.boolean().default(false),
  maxLength: z.number().int().min(1).max(4000).default(200),
})

export const templateFieldsSchema = z
  .object({
    images: z.object({ min: z.number().int().min(0).max(4), max: z.number().int().min(0).max(4) }),
    copy: z.array(copyFieldSchema).max(10).default([]),
    aspectRatios: z.array(z.string().regex(/^\d{1,2}:\d{1,2}$/)).min(1),
  })
  .refine((fields) => fields.images.min <= fields.images.max, {
    message: 'images.min must not exceed images.max',
    path: ['images'],
  })
  .refine((fields) => new Set(fields.copy.map((field) => field.key)).size === fields.copy.length, {
    message: 'copy field keys must be unique',
    path: ['copy'],
  })

export type TemplateFields = z.infer<typeof templateFieldsSchema>

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
export const templateTranslationSchema = z.object({
  name: optionalText(120),
  description: optionalText(300),
  fields: z
    .record(z.string().regex(/^[a-z][a-z0-9_]*$/), z.object({ label: optionalText(60), placeholder: optionalText(200) }))
    .optional(),
})
// Stored shape: every item optional, a missing one falls back to English.
export type TemplateTranslation = {
  name?: string
  description?: string
  fields?: Record<string, { label?: string; placeholder?: string }>
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
  body: z.string().min(1).max(20000),
  modelParams: z.record(z.string(), z.unknown()).default({}),
})

export type PromptInput = z.infer<typeof promptInputSchema>

export const templateWithPromptSchema = templateInputSchema.extend({ prompt: promptInputSchema })
