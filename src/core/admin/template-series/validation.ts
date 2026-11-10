import { z } from 'zod'

const optionalText = z.string().trim().max(5000).nullable().transform(value => value || null)
const slug = z.string().trim().max(128).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
export const saveSeriesSchema = z.object({
  id: z.uuid().nullable(),
  revision: z.string().regex(/^[a-f0-9]{32}$/).nullable(),
  fields: z.object({
    slug,
    name_en: z.string().trim().min(1).max(200), name_zh: z.string().trim().min(1).max(200),
    description_en: optionalText, description_zh: optionalText,
    cover_url: z.url({ protocol: /^https$/ }).max(4096).nullable(),
    category_key: z.string().min(1), sort_order: z.int32(), is_active: z.boolean(), show_members: z.boolean(),
  }),
  members: z.array(z.string().min(1)).refine(ids => new Set(ids).size === ids.length),
  reason: z.string().trim().max(500).nullable(),
}).refine(data => (data.id === null) === (data.revision === null))
export const searchSchema = z.object({ search: z.string().trim().max(160), after: z.string().min(1).max(200).nullable() })

// The read side accepts all values stored by the phase-one schema, including legacy
// cover URLs. Write validation above applies when submitting an edited series.
export const seriesCandidatesSchema = z.array(z.object({
  id: z.string(), name: z.string(), cover_url: z.string().nullable(), series_id: z.uuid().nullable(), is_active: z.boolean(),
}))
export const seriesDetailSchema = z.object({
  id: z.uuid(), revision: z.string(), slug: z.string(), category_key: z.string(), sort_order: z.int32(),
  name_zh: z.string(), name_en: z.string(), is_active: z.boolean(), show_members: z.boolean(),
  description_en: z.string().nullable(), description_zh: z.string().nullable(), cover_url: z.string().nullable(),
  members: seriesCandidatesSchema,
})
