import { z } from 'zod'

import { CARD_STYLES, CATEGORY_KEY_PATTERN, CATEGORY_LIMITS } from '../../src/core/templates/categories'
import { TEMPLATE_QUALITIES } from '../../src/core/templates/pricing'
import { promptInputSchema, TEMPLATE_MODULES, templateInputSchema } from '../../src/core/templates/schema'
import { MAX_STYLE_REFS } from '../../src/core/templates/style-refs'

// The batch file `pnpm templates:apply` reads (format: scripts/templates.example.json). It lives
// in .local/ because templates carry their private prompts; nothing here is ever printed.
// Every field except the ids is optional: an existing row keeps what the file leaves out.

const key = z.string().trim().min(1).max(CATEGORY_LIMITS.key).regex(CATEGORY_KEY_PATTERN)
const slug = z.string().trim().min(1).max(128).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const text = (max: number) => z.string().trim().max(max)
const reason = z.string().trim().min(1).max(500)
// A path relative to the batch file. Only image files are read (checked again when loaded).
const localFile = z.string().min(1).max(500).regex(/\.(jpe?g|png|webp)$/i, 'JPEG, PNG or WebP file')

export const categorySchema = z.strictObject({
  key, nameEn: text(CATEGORY_LIMITS.nameEn).min(1), nameZh: text(CATEGORY_LIMITS.nameZh).min(1),
  // Omitted: a new category goes to the root, an existing one stays where it is.
  parent: key.nullable().optional(),
  introEn: text(CATEGORY_LIMITS.intro).optional(), introZh: text(CATEGORY_LIMITS.intro).optional(),
  cardStyle: z.enum(CARD_STYLES).optional(), slug: key.optional(), isVisible: z.boolean().optional(),
  seoTitleEn: text(200).optional(), seoTitleZh: text(200).optional(),
  seoDescriptionEn: text(500).optional(), seoDescriptionZh: text(500).optional(),
})

// The reference library's own tree (T101). Matched by key, else by Chinese name (names are
// unique within the reference kind); a new one gets the admin's `ref-<uuid>` key.
export const referenceCategorySchema = z.strictObject({
  key: key.optional(), nameEn: text(CATEGORY_LIMITS.nameEn).min(1), nameZh: text(CATEGORY_LIMITS.nameZh).min(1),
  parent: key.nullable().optional(),
})

export const seriesSchema = z.strictObject({
  slug,
  nameEn: text(200).min(1).optional(), nameZh: text(200).min(1).optional(),
  descriptionEn: text(5000).nullable().optional(), descriptionZh: text(5000).nullable().optional(),
  category: key.optional(), sortOrder: z.int32().optional(),
  isActive: z.boolean().optional(), showMembers: z.boolean().optional(),
  // A member's after cover, an https address, or null to fall back to the first visible member.
  cover: z.union([z.strictObject({ template: slug }), z.strictObject({ url: z.url({ protocol: /^https$/ }).max(4096) }), z.null()]).optional(),
  // The whole ordered member list. Templates can also join with their own `series`.
  members: z.array(slug).max(200).refine(ids => new Set(ids).size === ids.length, 'members must be unique').optional(),
  unpublishReason: reason.optional(),
})

const coverSchema = z.union([
  z.strictObject({ before: localFile.optional(), after: localFile.optional() })
    .refine(cover => cover.before || cover.after, 'before or after'),
  // A trial run of this template (「设为封面」): its result is the after, its photo the before.
  z.strictObject({ testRun: z.uuid() }),
])

// Without the editor schema's defaults: a field the file leaves out must keep the stored value,
// not turn into `image` / `high` / `{}`.
const templateFields = templateInputSchema.partial().omit({ id: true, isActive: true }).extend({
  module: z.enum(TEMPLATE_MODULES).optional(), quality: z.enum(TEMPLATE_QUALITIES).optional(),
})

export const templateItemSchema = templateFields.extend({
  id: templateInputSchema.shape.id,
  // Kept for old batch files and ignored: publishing is `publish`, never a side effect of a save.
  isActive: z.boolean().optional(),
  // Any level of the template tree; the database files the template under its root.
  category: key.optional(),
  series: slug.nullable().optional(),
  prompt: z.strictObject({
    body: promptInputSchema.shape.body.optional(), modelParams: z.record(z.string(), z.unknown()).optional(),
  }).optional(),
  // 'default' follows the site's default image model; otherwise a provider id, label or model name.
  model: z.string().trim().min(1).max(120).optional(),
  styleRefs: z.array(localFile).max(MAX_STYLE_REFS).optional(),
  cover: coverSchema.optional(),
  openSale: z.boolean().optional(),
  publish: z.boolean().optional(),
  unpublishReason: reason.optional(),
}).strict()

export const batchSchema = z.strictObject({
  $comment: z.string().optional(),
  categories: z.array(categorySchema).max(100).default([]),
  referenceCategories: z.array(referenceCategorySchema).max(100).default([]),
  series: z.array(seriesSchema).max(100).default([]),
  templates: z.array(templateItemSchema).max(200).default([]),
}).superRefine((batch, ctx) => {
  const unique = (values: string[], path: string) => {
    const seen = new Set<string>()
    for (const value of values) {
      if (seen.has(value)) ctx.addIssue({ code: 'custom', path: [path], message: `duplicate ${value}` })
      seen.add(value)
    }
  }
  unique(batch.categories.map(c => c.key), 'categories')
  unique(batch.series.map(s => s.slug), 'series')
  unique(batch.templates.map(t => t.id), 'templates')
})

export type Batch = z.infer<typeof batchSchema>
export type CategoryItem = Batch['categories'][number]
export type ReferenceCategoryItem = Batch['referenceCategories'][number]
export type SeriesItem = Batch['series'][number]
export type TemplateItem = Batch['templates'][number]

// A message per problem, with the JSON path: never the value, which may be a prompt.
export function parseBatch(input: unknown): Batch {
  const parsed = batchSchema.safeParse(input)
  if (parsed.success) return parsed.data
  const lines = parsed.error.issues.map(issue => `${issue.path.join('.') || 'file'}: ${issue.message}`)
  throw new Error(`批次文件格式不对：\n  ${lines.join('\n  ')}`)
}
