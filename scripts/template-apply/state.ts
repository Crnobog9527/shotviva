import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { listAdminTemplates } from '../../src/core/admin/templates/repository'
import type { AdminTemplate } from '../../src/core/admin/templates/types'
import { getAdminSeries } from '../../src/core/admin/template-series/repository'
import type { SeriesDetail } from '../../src/core/admin/template-series/types'
import type { ImageProviderOption } from '../../src/core/admin/image-provider-field'
import type { ProviderFloors } from '../../src/core/templates/provider-pricing'
import type { StyleRef } from '../../src/core/templates/style-refs'
import { getProfileDetail } from '../../src/core/admin/template-profiles/repository'
import { findTestRun } from '../../src/modules/image/test-run/test-run-store'
import { pricingFromOptions } from '../../src/core/admin/templates/provider-pricing'
import { readPricingOptions } from '../../src/site/template-pricing'
import type { Batch } from './schema'

// What the target database holds right now, read once before planning. Reads only; the plan
// is built from this snapshot and every write re-checks it under the admin functions' locks.

const categoryRow = z.object({
  key: z.string(), kind: z.enum(['template', 'reference']), parent_id: z.string().nullable(),
  name_en: z.string(), name_zh: z.string(), intro_en: z.string().nullable(), intro_zh: z.string().nullable(),
  card_style: z.string(), slug: z.string(), is_visible: z.boolean(), is_system: z.boolean(),
  seo_title_en: z.string().nullable(), seo_title_zh: z.string().nullable(),
  seo_description_en: z.string().nullable(), seo_description_zh: z.string().nullable(),
})
export type CategoryRow = z.infer<typeof categoryRow>

export type TestRunInfo = { id: string; templateId: string; ok: boolean }

export type DbState = {
  categories: Map<string, CategoryRow>
  series: Map<string, SeriesDetail>
  // Every series' slug by id: a template's current series, wherever it is.
  seriesSlugs: Map<string, string>
  templates: Map<string, AdminTemplate>
  providers: ImageProviderOption[]
  floors: ProviderFloors
  testRuns: Map<string, TestRunInfo>
  // Provider profiles (1440) of the batch's templates that name profiles: which is live, and each
  // saved profile's version and content (for a re-run that changes nothing).
  profiles: Map<string, TemplateProfiles>
}

export type StoredProfile = { version: number; body: string; modelParams: Record<string, unknown>; providerId: string | null
  styleRefs: StyleRef[]; quality: string; creditsCost: Record<string, number>; unpricedResolutions: string[] }
export type TemplateProfiles = { active: 'openai' | 'seedream'; stored: Partial<Record<'openai' | 'seedream', StoredProfile>> }

async function readCategories(db: SupabaseClient) {
  const { data, error } = await db.from('template_categories').select(Object.keys(categoryRow.shape).join(','))
    .order('key').limit(2000)
  if (error) throw new Error('读取分类失败')
  return new Map(z.array(categoryRow).parse(data).map(row => [row.key, row]))
}

// Every series the batch names, by slug (the file's identity for a series), with its revision.
async function readSeries(db: SupabaseClient, slugs: string[]) {
  const result = new Map<string, SeriesDetail>()
  if (slugs.length === 0) return result
  const { data, error } = await db.from('template_series').select('id,slug').in('slug', slugs)
  if (error) throw new Error('读取系列失败')
  for (const row of z.array(z.object({ id: z.uuid(), slug: z.string() })).parse(data)) {
    const detail = await getAdminSeries(db, row.id)
    if (detail) result.set(detail.slug, detail)
  }
  return result
}

async function readTestRuns(db: SupabaseClient, ids: string[]) {
  const result = new Map<string, TestRunInfo>()
  for (const id of ids) {
    const run = await findTestRun(db, id)
    if (run) result.set(id, { id, templateId: run.templateId, ok: run.status === 'succeeded' && Boolean(run.outputKey) })
  }
  return result
}

function seriesSlugs(batch: Batch, templates: Map<string, AdminTemplate>, idToSlug: Map<string, string>) {
  const slugs = new Set(batch.series.map(s => s.slug))
  for (const item of batch.templates) {
    if (item.series) slugs.add(item.series)
    const current = templates.get(item.id)?.seriesId
    if (item.series !== undefined && current) slugs.add(idToSlug.get(current) ?? '')
  }
  slugs.delete('')
  return [...slugs]
}

async function seriesSlugById(db: SupabaseClient) {
  const { data, error } = await db.from('template_series').select('id,slug').limit(2000)
  if (error) throw new Error('读取系列失败')
  return new Map(z.array(z.object({ id: z.string(), slug: z.string() })).parse(data).map(r => [r.id, r.slug]))
}

async function readProfiles(db: SupabaseClient, batch: Batch) {
  const ids = batch.templates.filter(t => t.profiles || t.activeProfile).map(t => t.id)
  const result = new Map<string, TemplateProfiles>()
  if (ids.length === 0) return result
  const { data, error } = await db.from('template_prompts').select('template_id, active_profile').in('template_id', ids)
  if (error) throw new Error('读取供应商配置失败')
  for (const row of z.array(z.object({ template_id: z.string(), active_profile: z.enum(['openai', 'seedream']) })).parse(data)) {
    const stored: TemplateProfiles['stored'] = {}
    for (const key of ['openai', 'seedream'] as const) {
      const detail = await getProfileDetail(db, row.template_id, key)
      if (detail) stored[key] = { version: detail.version, body: detail.body, modelParams: detail.modelParams, providerId: detail.providerId,
        styleRefs: detail.styleRefs, quality: detail.quality, creditsCost: detail.creditsCost, unpricedResolutions: detail.unpricedResolutions }
    }
    result.set(row.template_id, { active: row.active_profile, stored })
  }
  return result
}

export async function readState(db: SupabaseClient, batch: Batch): Promise<DbState> {
  const [categories, all, providers, idToSlug] = await Promise.all([
    readCategories(db), listAdminTemplates(db), readPricingOptions(db), seriesSlugById(db),
  ])
  const templates = new Map(all.map(t => [t.id, t]))
  const runIds = batch.templates.flatMap(t => t.cover && 'testRun' in t.cover ? [t.cover.testRun] : [])
  const [series, testRuns, profiles] = await Promise.all([
    readSeries(db, seriesSlugs(batch, templates, idToSlug)), readTestRuns(db, runIds), readProfiles(db, batch),
  ])
  return { categories, series, seriesSlugs: idToSlug, templates, providers, floors: pricingFromOptions(providers), testRuns, profiles }
}
