import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { cacheLife, cacheTag, unstable_cache } from 'next/cache'

import { createAdminSupabase } from '../auth/supabase-admin'
import { FAILED_READ_LIFE } from '../cache-life'
import type { Locale } from '../i18n/locales'
import { logger } from '../logger'
import { PROVIDERS_CACHE_TAG } from '../providers/cache-tag'
import { TEMPLATES_CACHE_TAG } from './cache'
import { CATALOGUE_LIFE } from './cached-catalogue'
import { toCatalogueIndex } from './catalogue-index'
import { catalogueEntries, type CatalogueMember, type CatalogueSeriesRow } from './catalogue-index-entries'
import { localizeTemplate } from './localize'
import { readCategoryTree } from './taxonomy-reads'
import { TEMPLATE_COLUMNS, toTemplate, type TemplateRow } from './types'

type TemplateWithPlacement = TemplateRow & {
  subcategory_key: string | null
  series_id: string | null
  series_sort_order: number
  template_series: (CatalogueSeriesRow & { show_members: boolean }) | null
}

const PAGE_SIZE = 500
const COLUMNS = TEMPLATE_COLUMNS + ',subcategory_key,series_id,series_sort_order,' +
  'template_series(id,slug,name_en,name_zh,description_en,description_zh,cover_url,category_key,sort_order,show_members)'

async function saleCheckedRows(db: SupabaseClient) {
  const rows: TemplateWithPlacement[] = []
  for (;;) {
    const query = db.rpc('web_templates', { p_template_id: null, p_include_members: true }).select(COLUMNS)
    const last = rows.at(-1)
    if (last) query.gt('id', last.id)
    const { data, error } = await query.order('id').limit(PAGE_SIZE).returns<TemplateWithPlacement[]>()
    if (error || !data) throw new Error(`create catalogue templates: ${error?.message ?? 'no data'}`)
    rows.push(...data)
    if (data.length < PAGE_SIZE) return rows
  }
}

export async function readCreateCatalogue(db: SupabaseClient) {
  const [rows, tree] = await Promise.all([
    saleCheckedRows(db),
    readCategoryTree(db).catch((error: unknown) => {
      logger.error('templates.create_category_tree_failed', { error })
      return null
    }),
  ])
  // The database checks publication, category visibility and eligibility for these same rows.
  const series = new Map<string, CatalogueSeriesRow>()
  const categories = new Set<string>()
  const members = rows.map((row) => catalogueMember(row, series, categories))
  const entries = catalogueEntries(members, [...series.values()], categories)
  const templates = rows.sort((a, b) => a.sort_order - b.sort_order).map(toTemplate)
    .filter((template) => !template.categoryInfo.isSystem)
  return { tree, entries, members, templates }
}

function catalogueMember(row: TemplateWithPlacement, series: Map<string, CatalogueSeriesRow>, categories: Set<string>): CatalogueMember {
  const item = row.template_series
  if (item) {
    series.set(item.id, item)
    categories.add(item.category_key)
  }
  return {
    id: row.id, series_id: row.series_id, series_sort_order: row.series_sort_order,
    sort_order: row.sort_order, category_key: row.subcategory_key ?? row.category_key,
    standalone: row.series_id === null || item?.show_members === true,
  }
}

type Snapshot = Awaited<ReturnType<typeof readCreateCatalogue>>
let filling: Promise<Snapshot> | undefined

async function fillCreateCatalogue() {
  const started = performance.now()
  const snapshot = await readCreateCatalogue(createAdminSupabase())
  logger.info('templates.create_catalogue_fill', { durationMs: Math.round(performance.now() - started) })
  return snapshot
}

function sharedFill(): Promise<Snapshot> {
  filling ??= fillCreateCatalogue().finally(() => { filling = undefined })
  return filling
}

class IncompleteCatalogue extends Error {
  constructor(readonly snapshot: Snapshot) {
    super('Create catalogue category tree is unavailable')
  }
}

// The Data Cache can reuse a snapshot across deployments. Bump the key when its data shape or
// read semantics change. Keep the existing template and provider mutation tags on the entry.
const readCachedSnapshot = unstable_cache(async () => {
  const snapshot = await sharedFill()
  if (snapshot.tree === null) throw new IncompleteCatalogue(snapshot)
  return { snapshot, filledAt: Date.now() }
}, ['create-catalogue-v1'], {
  tags: [TEMPLATES_CACHE_TAG, PROVIDERS_CACHE_TAG],
  revalidate: CATALOGUE_LIFE.revalidate,
})

async function remoteCreateCatalogue() {
  'use cache: remote'
  // Keep Next's remote fill path on simultaneous requests. A new build can seed it from the
  // durable entry. A short lifetime keeps this layer close to the durable entry's refresh.
  cacheTag(TEMPLATES_CACHE_TAG, PROVIDERS_CACHE_TAG)
  try {
    const result = await readCachedSnapshot()
    cacheLife({ revalidate: 300, expire: 600 })
    return result
  } catch (error) {
    // Preserve the flat-list fallback without storing a partial result in the Data Cache.
    if (!(error instanceof IncompleteCatalogue)) throw error
    cacheLife(FAILED_READ_LIFE)
    return { snapshot: error.snapshot, filledAt: Date.now() }
  }
}

async function cachedCreateCatalogue() {
  const { snapshot, filledAt } = await remoteCreateCatalogue()
  if (Date.now() - filledAt < CATALOGUE_LIFE.expire * 1000) return snapshot
  // Keep the hard age limit even if a background revalidation failed.
  return sharedFill()
}

export async function loadCreateCatalogue(locale: Locale, posters: boolean | Promise<boolean>) {
  const [snapshot, allowed] = await Promise.all([cachedCreateCatalogue(), posters])
  const members = snapshot.members.filter((member): member is CatalogueMember & { series_id: string } => member.series_id !== null)
  return {
    index: snapshot.tree === null ? null : toCatalogueIndex(snapshot.tree, snapshot.entries, members, locale),
    templates: snapshot.templates.filter((template) => allowed || !template.fields.poster)
      .map((template) => localizeTemplate(template, locale)),
  }
}
