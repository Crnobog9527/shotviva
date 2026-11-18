import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { cacheLife, cacheTag } from 'next/cache'

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

// Simultaneous misses on an instance share only the in-flight read. Next owns tag invalidation
// and expiry of completed snapshots, and the same snapshot serves both languages.
async function cachedCreateCatalogue(): Promise<Snapshot> {
  'use cache: remote'
  cacheTag(TEMPLATES_CACHE_TAG, PROVIDERS_CACHE_TAG)
  filling ??= readCreateCatalogue(createAdminSupabase()).finally(() => { filling = undefined })
  const snapshot = await filling
  cacheLife(snapshot.tree === null ? FAILED_READ_LIFE : CATALOGUE_LIFE)
  return snapshot
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
