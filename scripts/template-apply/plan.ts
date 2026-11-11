import { z } from 'zod'

import { resolveCover, resolveStyleRefs, type AssetContext } from './assets'
import { planCategory, planReferenceCategory, parentsFirst } from './plan-taxonomy'
import { planTemplate, type TemplateAssets } from './plan-template'
import type { PlanItem } from './plan-types'
import { memberTargets, planSeriesFields, planSeriesMembers, seriesFields } from './plan-series'
import type { Batch, TemplateItem } from './schema'
import type { DbState } from './state'

// The whole batch in the order its steps depend on each other: categories, then series fields,
// then templates (which may join a series), then series member order. Every problem found here
// is reported without sending that item; the database checks the rest again.

function message(error: unknown) {
  if (error instanceof z.ZodError) return `字段不对：${error.issues.map(i => i.path.join('.') || i.message).join('、')}`
  return error instanceof Error ? error.message : String(error)
}

function safely(base: Omit<PlanItem, 'actions' | 'ops' | 'problems' | 'notes'>, plan: () => PlanItem): PlanItem {
  try {
    return plan()
  } catch (error) {
    return { ...base, actions: [], ops: [], problems: [message(error)], notes: [] }
  }
}

async function templateAssets(item: TemplateItem, state: DbState, ctx: AssetContext) {
  const assets: TemplateAssets = {}
  const problems: string[] = []
  try {
    if (item.styleRefs) assets.styleRefs = await resolveStyleRefs(ctx, item.id, item.styleRefs, state.templates.get(item.id)?.prompt?.styleRefs ?? [])
    if (item.cover) assets.cover = await resolveCover(ctx, item.id, item.cover)
  } catch (error) {
    problems.push(message(error))
  }
  return { assets, problems }
}

// Members an explicit list pulls in from another series join through their own template save
// (the editor's assignment), so a template item is added for each one the file does not list.
function templateItems(batch: Batch, state: DbState, targets: Map<string, string | null>): TemplateItem[] {
  const listed = new Set(batch.templates.map(t => t.id))
  const extra = [...targets].filter(([id, slug]) => {
    const seriesId = state.templates.get(id)?.seriesId
    return !listed.has(id) && seriesId && state.seriesSlugs.get(seriesId) !== slug
  })
  return [...batch.templates, ...extra.map(([id]) => ({ id }) as TemplateItem)]
}

async function planTemplates(batch: Batch, state: DbState, ctx: AssetContext & { skip?: Set<string> }, targets: Map<string, string | null>) {
  const known = new Set([...state.series.keys(), ...batch.series.map(s => s.slug)])
  const items: PlanItem[] = []
  for (const item of templateItems(batch, state, targets)) {
    const write = ctx.write && !ctx.skip?.has(`template:${item.id}`)
    const { assets, problems } = await templateAssets(item, state, { ...ctx, write })
    const planned = safely({ ref: `template:${item.id}`, kind: 'template', label: item.id },
      () => planTemplate(item, { state, seriesTarget: targets, knownSeries: known }, assets))
    items.push({ ...planned, problems: [...problems, ...planned.problems] })
  }
  return items
}

// After covers as they will be once the templates are saved, for a series cover `{ template }`.
function afterCovers(state: DbState, templates: PlanItem[]) {
  const covers = new Map([...state.templates.values()].map(t => [t.id, t.coverAfterUrl]))
  for (const item of templates) {
    const cover = item.ops.find(op => op.op === 'set_cover' || op.op === 'test_run_cover')
    if (typeof cover?.after === 'string') covers.set(item.label, cover.after)
  }
  return covers
}

function planSeries(batch: Batch, state: DbState, templates: PlanItem[]) {
  const { problems } = memberTargets(batch, state)
  const created = new Set(batch.categories.map(c => c.key))
  const covers = afterCovers(state, templates)
  const before: PlanItem[] = []
  const after: PlanItem[] = []
  for (const item of batch.series) {
    const base = { ref: `series:${item.slug}`, kind: 'series' as const, label: item.slug }
    let fields: ReturnType<typeof seriesFields> | undefined
    before.push(safely(base, () => planSeriesFields(item, state, (fields = seriesFields(item, state, covers)), created)))
    const members = fields && planSeriesMembers(item, fields, problems.get(item.slug) ?? [], state.series.get(item.slug))
    if (members) after.push(members)
  }
  return { before, after }
}

export async function buildPlan(batch: Batch, state: DbState, ctx: AssetContext & { skip?: Set<string> }): Promise<PlanItem[]> {
  const categories = parentsFirst(batch.categories).map(item =>
    safely({ ref: `category:${item.key}`, kind: 'category', label: item.key }, () => planCategory(item, state)))
  const references = parentsFirst(batch.referenceCategories).map(item =>
    safely({ ref: `reference:${item.key ?? item.nameZh}`, kind: 'reference', label: item.nameZh }, () => planReferenceCategory(item, state)))
  const { targets } = memberTargets(batch, state)
  const templates = await planTemplates(batch, state, ctx, targets)
  const series = planSeries(batch, state, templates)
  return [...categories, ...references, ...series.before, ...templates, ...series.after]
}
