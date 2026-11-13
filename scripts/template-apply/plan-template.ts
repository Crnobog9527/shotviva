import { describeBlockers, publishBlockers } from '../../src/core/admin/templates/publish-rules'
import type { AdminTemplate } from '../../src/core/admin/templates/types'
import { EDIT_TEMPLATE_ID } from '../../src/core/templates/edit-params'
import type { StyleRef } from '../../src/core/templates/style-refs'
import type { CoverOp } from './assets'
import type { PlanItem } from './plan-types'
import type { TemplateItem } from './schema'
import type { DbState } from './state'
import { buildSave, givesTemplateFields, savesNothing, type SavePlan } from './template-payload'
import { planProfiles } from './plan-profiles'

// One template item → the steps the admin would click, in the order that works: 下架 first (a
// sale can only close on an unpublished template), then 保存 (fields, category, series, model and
// references in one versioned save), 封面, 开放销售, and 上架 last, checked by the 上架 switch's
// own rules against what the row will hold once the earlier steps are done.

export type TemplateAssets = { styleRefs?: StyleRef[]; cover?: CoverOp }
type Ctx = { state: DbState; seriesTarget: Map<string, string | null>; knownSeries: Set<string> }

function currentSeriesSlug(current: AdminTemplate | undefined, state: DbState) {
  return current?.seriesId ? state.seriesSlugs.get(current.seriesId) ?? null : null
}

function assignment(item: TemplateItem, current: AdminTemplate | undefined, ctx: Ctx) {
  const now = currentSeriesSlug(current, ctx.state)
  const wanted = item.series !== undefined ? item.series : ctx.seriesTarget.has(item.id) ? ctx.seriesTarget.get(item.id) ?? null : now
  const previous = current ? { previous_category: current.subcategoryKey ?? current.category, previous_series_id: current.seriesId ?? null } : {}
  if (wanted && wanted !== now && !ctx.knownSeries.has(wanted)) throw new Error(`系列 ${wanted} 不存在，先在 series 里定义它`)
  if (wanted === now) return { changed: false, step: { assignment: { series_id: current?.seriesId ?? null, ...previous } } }
  const step = wanted ? { series_slug: wanted } : {}
  return { changed: true, wanted, step: { ...step, assignment: { series_id: null, ...previous } } }
}

function saveStep(item: TemplateItem, current: AdminTemplate | undefined, ctx: Ctx, assets: TemplateAssets) {
  const series = assignment(item, current, ctx)
  const wanted = !current || givesTemplateFields(item) || item.model !== undefined || assets.styleRefs !== undefined || series.changed
  if (!wanted) return null
  const plan = buildSave(item, current, { floors: ctx.state.floors, providers: ctx.state.providers, styleRefs: assets.styleRefs })
  if (current && !series.changed && savesNothing(plan, current)) return null
  const { p_template, p_prompt, p_style_refs } = plan.args as typeof plan.args & { p_style_refs?: StyleRef[] }
  const step = {
    op: 'save_template', id: item.id, is_new: !current, template: p_template, prompt: p_prompt,
    ...(p_style_refs ? { style_refs: p_style_refs } : {}), ...series.step,
    ...(current?.prompt ? { expected: current.prompt.version } : {}),
  }
  return { plan, step, seriesChanged: series.changed ? series.wanted ?? null : undefined }
}

// The 上架 switch's rules (publishBlockers) on the row as it will be after this item's steps.
function publishProblem(item: TemplateItem, current: AdminTemplate | undefined, ctx: Ctx, plan: SavePlan | undefined, cover?: CoverOp) {
  const t = plan?.template
  if (!t && !current) return '模板不存在'
  const covers = cover?.op === 'set_cover' ? cover : cover ? { before: cover.before ?? undefined, after: cover.after } : {}
  const blockers = publishBlockers({
    id: item.id, name: t?.name ?? current!.name, description: t ? t.description ?? current?.description ?? null : current!.description,
    visibleIn: t?.visibleIn ?? current!.visibleIn, quality: t?.quality ?? current!.quality, creditsCost: t?.creditsCost ?? current!.creditsCost,
    coverBeforeUrl: covers.before ?? current?.coverBeforeUrl ?? null, coverAfterUrl: covers.after ?? current?.coverAfterUrl ?? null,
    coverLocales: current?.coverLocales ?? {}, isActive: current?.isActive ?? false,
    unpricedResolutions: t?.unpricedResolutions ?? current?.unpricedResolutions ?? [],
    saleEnabled: item.openSale ?? current?.saleEnabled ?? false, hasPrompt: Boolean(plan) || Boolean(current?.prompt),
    category: t?.category ?? current?.category, providerId: plan ? plan.providerId : current?.prompt?.providerId,
  }, ctx.state.floors)
  return blockers.length > 0 ? `不能上架：${describeBlockers(blockers)}` : null
}

function unpublishStep(item: TemplateItem, current: AdminTemplate | undefined, problems: string[]) {
  if (item.publish !== false || !current?.isActive) return []
  if (!item.unpublishReason) problems.push('下架要写 unpublishReason（和后台一样必须填原因）')
  return [{ op: 'set_active', id: item.id, active: false, reason: item.unpublishReason ?? null }]
}

// A cover the row already has is not set again, so a re-run reports 无变化.
function changedCover(cover: CoverOp | undefined, current: AdminTemplate | undefined): CoverOp | undefined {
  if (!cover || !current) return cover
  if (cover.op === 'test_run_cover') {
    return cover.after === current.coverAfterUrl && (cover.before ?? current.coverBeforeUrl) === current.coverBeforeUrl ? undefined : cover
  }
  const next: CoverOp = { op: 'set_cover' }
  if (cover.before !== undefined && cover.before !== current.coverBeforeUrl) next.before = cover.before
  if (cover.after !== undefined && cover.after !== current.coverAfterUrl) next.after = cover.after
  return next.before || next.after ? next : undefined
}

function laterSteps(item: TemplateItem, current: AdminTemplate | undefined, ctx: Ctx, save: ReturnType<typeof saveStep>, assets: TemplateAssets, problems: string[]) {
  const steps: Record<string, unknown>[] = []
  const cover = changedCover(assets.cover, current)
  if (cover) steps.push({ ...cover, id: item.id })
  if (item.openSale !== undefined && item.openSale !== (current?.saleEnabled ?? false)) steps.push({ op: 'set_sale', id: item.id, enabled: item.openSale })
  if (item.publish && !current?.isActive) {
    const problem = publishProblem(item, current, ctx, save?.plan, assets.cover)
    if (problem) problems.push(problem)
    steps.push({ op: 'set_active', id: item.id, active: true })
  }
  return steps
}

function describe(ops: Record<string, unknown>[], current: AdminTemplate | undefined, seriesChanged: string | null | undefined) {
  const names: Record<string, string> = { set_cover: '封面', test_run_cover: '试跑封面', set_sale: '销售' }
  const profile = (key: unknown) => key === 'seedream' ? 'Seedream' : 'ChatGPT'
  return ops.map(op => {
    if (op.op === 'save_template') return (current ? '更新' : '新建') + (seriesChanged !== undefined ? `（系列→${seriesChanged ?? '无'}）` : '')
    if (op.op === 'set_active') return op.active ? '上架' : '下架'
    if (op.op === 'set_sale') return op.enabled ? '开放销售' : '关闭销售'
    if (op.op === 'save_profile') return `保存${profile(op.profile)}配置`
    if (op.op === 'switch_profile') return `切到${profile(op.profile)}配置`
    return names[String(op.op)] ?? String(op.op)
  })
}

export function planTemplate(item: TemplateItem, ctx: Ctx, assets: TemplateAssets): PlanItem {
  const current = ctx.state.templates.get(item.id)
  const problems: string[] = []
  const base = { ref: `template:${item.id}`, kind: 'template' as const, label: item.id }
  if (item.id === EDIT_TEMPLATE_ID) return { ...base, actions: [], ops: [], problems: ['作品编辑模板在「作品编辑」页单独管理'], notes: [] }
  const notes: string[] = item.isActive === undefined ? [] : ['isActive 已忽略：上下架只看 publish']
  let save: ReturnType<typeof saveStep> = null
  try {
    save = saveStep(item, current, ctx, assets)
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error))
  }
  const ops = [...unpublishStep(item, current, problems), ...(save ? [save.step] : []), ...planProfiles(item, ctx.state, problems, notes),
    ...laterSteps(item, current, ctx, save, assets, problems)]
  const idle = problems.length ? ['—'] : ['无变化']
  return { ...base, actions: ops.length ? describe(ops, current, save?.seriesChanged) : idle, ops, problems, notes }
}
