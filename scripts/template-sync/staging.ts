import { z } from 'zod'

import { SyncError } from './covers'
import type { SyncTarget } from './sync'

// A dry run between two databases (production → preview, 2026-11-15) checks each step in its own
// transaction and rolls it back at once. A category, series or template that is new on the target
// is therefore gone again when the steps that need it are checked, and those checks fail with a
// prerequisite error although the write run creates the prerequisite first. `Staged` records what
// this run would create; a prerequisite error that names a staged item is reported as deferred to
// the write run. Any other error still fails the dry run, and the write run checks everything. A
// write run stages nothing, so nothing is ever deferred there.

const PREREQUISITE_ERRORS = new Set([
  'CATEGORY_MISSING', 'SUBCATEGORY_MISSING', 'CATEGORY_PARENT_MISSING', 'SERIES_CATEGORY_MISSING', 'SERIES_MISSING',
])

export type Staged = { categories: Set<string>; series: Set<string>; templates: Set<string> }
export const stageNothing = (): Staged => ({ categories: new Set(), series: new Set(), templates: new Set() })
export type Needs = { categories?: readonly (string | null)[]; series?: readonly (string | null)[]; templates?: readonly string[] }

const note = (names: string[]) => `not checked in a dry run: needs ${names.join(', ')}, new in this run (checked when written)`

// The staged items among `needs`, or none.
export function stagedNeeds(staged: Staged, needs: Needs) {
  return [
    ...(needs.categories ?? []).filter((key): key is string => !!key && staged.categories.has(key)).map(key => `category ${key}`),
    ...(needs.series ?? []).filter((slug): slug is string => !!slug && staged.series.has(slug)).map(slug => `series ${slug}`),
    ...(needs.templates ?? []).filter(id => staged.templates.has(id)).map(id => `template ${id}`),
  ]
}

// The deferral note for a prerequisite error caused by staged items, else null (a real failure).
export function deferral(staged: Staged, code: string, needs: Needs) {
  if (!PREREQUISITE_ERRORS.has(code)) return null
  const names = stagedNeeds(staged, needs)
  return names.length ? note(names) : null
}

// A list of skipped members is deferred when every one of them is new in this run.
export function deferredMembers(staged: Staged, skipped: readonly string[]) {
  return skipped.length > 0 && skipped.every(id => staged.templates.has(id)) ? note(skipped.map(id => `template ${id}`)) : null
}

const TABLES = { categories: ['template_categories', 'key'], series: ['template_series', 'slug'] } as const

// Which of these keys or slugs the target does not have at all (deleted rows count as present).
export async function absentOn(target: SyncTarget, kind: keyof typeof TABLES, values: readonly string[]) {
  if (values.length === 0) return new Set<string>()
  const [table, column] = TABLES[kind]
  const { data, error } = await target.db.from(table).select(column).in(column, [...values])
  if (error) throw new SyncError('TARGET_READ_FAILED')
  const present = new Set(z.array(z.record(z.string(), z.string())).parse(data).map(row => row[column]))
  return new Set(values.filter(value => !present.has(value)))
}

// Where each template is filed on the source: its categories and its series, its prerequisites.
export async function templatePlaces(ids: readonly string[], source: SyncTarget) {
  if (ids.length === 0) return new Map<string, Needs>()
  const { data, error } = await source.db.from('templates').select('id, category_key, subcategory_key, template_series(slug)').in('id', [...ids])
  if (error) throw new SyncError('SOURCE_READ_FAILED')
  const rows = z.array(z.object({
    id: z.string(), category_key: z.string().nullable(), subcategory_key: z.string().nullable(),
    template_series: z.object({ slug: z.string() }).nullable(),
  })).parse(data)
  return new Map(rows.map(row => [row.id, { categories: [row.category_key, row.subcategory_key], series: [row.template_series?.slug ?? null] }]))
}
