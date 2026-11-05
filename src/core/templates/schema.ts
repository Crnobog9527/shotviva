import { z } from 'zod'

// Template shapes shared by the admin page, the import script and (later) generation.
// No `server-only` here: scripts/import-prompts.ts validates with the same schema.

export const TEMPLATE_SURFACES = ['web', 'partner'] as const
export type TemplateSurface = (typeof TEMPLATE_SURFACES)[number]

export const TEMPLATE_MODULES = ['image', 'video'] as const

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'lowercase letters, digits and dashes')

export const copyFieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: z.string().min(1).max(60),
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

// Public, catalogue-facing part of a template (the `templates` row).
export const templateInputSchema = z.object({
  id: slug.max(64),
  module: z.enum(TEMPLATE_MODULES).default('image'),
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(60),
  coverBeforeUrl: optionalUrl,
  coverAfterUrl: optionalUrl,
  fields: templateFieldsSchema,
  creditsCost: z.number().int().min(1).max(100).default(1),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  visibleIn: z
    .array(z.enum(TEMPLATE_SURFACES))
    .min(1)
    .transform((surfaces) => [...new Set(surfaces)]),
})

export type TemplateInput = z.infer<typeof templateInputSchema>

// Private part (the `template_prompts` row). Never sent to non-admin clients.
export const promptInputSchema = z.object({
  body: z.string().min(1).max(20000),
  modelParams: z.record(z.string(), z.unknown()).default({}),
})

export type PromptInput = z.infer<typeof promptInputSchema>

export const templateWithPromptSchema = templateInputSchema.extend({ prompt: promptInputSchema })
