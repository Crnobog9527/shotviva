import { syncCategories, templateCategoryKeys } from './categories'
import { SyncError } from './covers'
import { readSeries, syncSeriesDefinition, syncSeriesDelete, syncSeriesMembers, type SeriesSnapshot } from './series'
import { absentOn, deferral, deferredMembers, stageNothing, templatePlaces, type Needs, type Staged } from './staging'
import { readDeletedIds, readStates, syncSeriesActive, syncTemplateState } from './state'
import { syncTemplate, type SyncTarget } from './sync'

// One dispatch (2026-11-12): templates by id and whole series by slug, the test site being the only
// source. Series deleted on the test site are deleted on production first (2026-11-14). The order
// then keeps every step's prerequisites in place on production: categories (parents
// first), series definitions, series going down, the templates (content, then sale and publication;
// members included), each series' member order, series going up. So a series is never live without
// its members, and goes down before they do. Every step is its own transaction; a failing item is
// reported and the rest go on, so one bad template does not hold back the series. A dry run
// (validateOnly) rolls every step back; between two databases it also records what it would create
// there, so a check that only fails for want of such a prerequisite is deferred (staging.ts).

export type SyncRequest = { templateIds: string[]; seriesSlugs: string[] }
export type Run = {
  runId: string
  // The production admin the changes are made and audited as (SYNC_PRODUCTION_ACTOR_ID).
  actorId: string
  source: SyncTarget
  target: SyncTarget
  validateOnly: boolean
  report: (line: string) => void
}

// Never log PostgREST detail, stack traces, arbitrary thrown messages or source data.
const reason = (error: unknown) => (error instanceof SyncError ? error.message : 'SYNC_FAILED')
const unique = (ids: readonly string[]) => [...new Set(ids)]

// What the steps share: the run, the failure reporter, and what a dry run would create.
type Step = { run: Run; fail: (line: string) => void; staged: Staged }
const none = () => new Set<string>()

// A failure, unless a dry run can only check it once a staged prerequisite exists. True if deferred.
function failOrDefer(step: Step, label: string, why: string, needs: Needs) {
  const deferred = deferral(step.staged, why, needs)
  if (deferred) step.run.report(`${label} ${why}: ${deferred}`)
  else step.fail(`${label} ${why}`)
  return deferred !== null
}

async function readAll(slugs: readonly string[], run: Run, fail: (line: string) => void) {
  const found: SeriesSnapshot[] = []
  for (const slug of slugs) {
    try {
      found.push(await readSeries(slug, run.source))
    } catch (error) {
      fail(`series ${slug} ${reason(error)}`)
    }
  }
  return found
}

// Series deleted on the test site (2026-11-14): deleted on production too, before anything else, so
// none of the later steps can file a template in them. They have no members to carry.
async function deletions(series: readonly SeriesSnapshot[], run: Run, fail: (line: string) => void) {
  const actor = { id: run.actorId, runId: run.runId }
  for (const item of series) {
    try {
      run.report(`series ${item.series.slug} ${await syncSeriesDelete(item.series.slug, actor, run.target, run.validateOnly)}`)
    } catch (error) {
      fail(`series ${item.series.slug} delete ${reason(error)}`)
    }
  }
}

// Parents come first, so a parent new in a dry run is staged before its children are judged.
async function categories(series: readonly SeriesSnapshot[], ids: readonly string[], step: Step) {
  const { run, staged } = step
  try {
    const keys = [...series.map((item) => item.series.category_key), ...await templateCategoryKeys(ids, run.source)]
    const outcomes = await syncCategories(keys, run.source, run.target, run.validateOnly)
    const absent = run.validateOnly ? await absentOn(run.target, 'categories', outcomes.map(o => o.key)).catch(none) : none()
    for (const outcome of outcomes) {
      const checked = 'error' in outcome
        ? failOrDefer(step, `category ${outcome.key}`, outcome.error, { categories: [outcome.parent] })
        : (run.report(`category ${outcome.key} ${outcome.result}`), true)
      if (checked && absent.has(outcome.key)) staged.categories.add(outcome.key)
    }
  } catch (error) {
    step.fail(`categories ${reason(error)}`)
  }
}

async function definitions(series: readonly SeriesSnapshot[], step: Step) {
  const { run, staged } = step
  const defined: SeriesSnapshot[] = []
  const absent = run.validateOnly ? await absentOn(run.target, 'series', series.map(s => s.series.slug)).catch(none) : none()
  for (const item of series) {
    const { slug } = item.series
    try {
      run.report(`series ${slug} ${await syncSeriesDefinition(item, run.source, run.target, run.validateOnly)}`)
      defined.push(item)
      if (absent.has(slug)) staged.series.add(slug)
    } catch (error) {
      const why = reason(error)
      // Deleted on production but not on the test site: production keeps it deleted (1502).
      if (why === 'SERIES_DELETED') step.fail(`series ${slug} ${why} on production, not brought back (use a new slug on the test site)`)
      else if (failOrDefer(step, `series ${slug}`, why, { categories: [item.series.category_key] }) && absent.has(slug)) {
        staged.series.add(slug)
        defined.push(item)
      }
    }
  }
  return defined
}

// A member deleted on production stays out of the series there (the guard trigger would refuse it).
async function members(series: readonly SeriesSnapshot[], goneHere: ReadonlySet<string>, step: Step) {
  const { run, staged } = step
  for (const item of series) {
    const label = `series ${item.series.slug} members`
    if (staged.series.has(item.series.slug)) {
      run.report(`${label} not checked in a dry run: the series is new in this run (checked when written)`)
      continue
    }
    const kept = item.members.filter((id) => !goneHere.has(id))
    if (kept.length < item.members.length) {
      run.report(`${label} SKIPPED deleted on production: ${item.members.filter((id) => goneHere.has(id)).join(' ')}`)
    }
    try {
      const { placed, skipped } = await syncSeriesMembers({ ...item, members: kept }, run.target, run.validateOnly)
      const line = `${label} ${placed.length}/${item.members.length}`
      const deferred = deferredMembers(staged, skipped)
      if (deferred) run.report(`${line} SKIPPED ${skipped.join(' ')}: ${deferred}`)
      else if (skipped.length > 0) step.fail(`${line} SKIPPED ${skipped.join(' ')}`)
      else run.report(line)
    } catch (error) {
      failOrDefer(step, label, reason(error), { series: [item.series.slug] })
    }
  }
}

// 上下架 of each series, in the direction asked (down before the templates, up after them).
async function seriesActive(series: readonly SeriesSnapshot[], active: boolean, step: Step) {
  const { run, staged } = step
  const actor = { id: run.actorId, runId: run.runId }
  for (const item of series.filter((one) => one.series.is_active === active)) {
    const { slug } = item.series
    if (staged.series.has(slug)) {
      run.report(`series ${slug} state not checked in a dry run: the series is new in this run (checked when written)`)
      continue
    }
    try {
      run.report(`series ${slug} ${await syncSeriesActive(slug, active, actor, run.target, run.validateOnly)}`)
    } catch (error) {
      failOrDefer(step, `series ${slug} state`, reason(error), { templates: item.members })
    }
  }
}

// In a dry run: the templates new on the target (staged) and where each is filed on the source.
async function stageTemplates(ids: readonly string[], step: Step) {
  if (!step.run.validateOnly) return new Map<string, Needs>()
  const present = await readStates(ids, step.run.target).catch(() => null)
  if (present) for (const id of ids) if (!present.has(id)) step.staged.templates.add(id)
  return templatePlaces(ids, step.run.source).catch(() => new Map<string, Needs>())
}

// Each template's content, then its sale and publication as on the test site.
async function templates(ids: readonly string[], goneHere: ReadonlySet<string>, step: Step) {
  const { run, staged } = step
  const actor = { id: run.actorId, runId: run.runId }
  const states = await readStates(ids, run.source).catch((error: unknown) => {
    step.fail(`states ${reason(error)}`)
    return null
  })
  const places = await stageTemplates(ids, step)
  for (const id of ids) {
    const state = states?.get(id)
    if (state?.deleted || goneHere.has(id)) {
      run.report(`${id} SKIPPED deleted on ${state?.deleted ? 'the test site' : 'production'} (deletes are not synced)`)
      continue
    }
    try {
      const version = await syncTemplate(id, run.runId, run.source, run.target, run.validateOnly)
      run.report(`${id} ${run.validateOnly ? 'DRY-RUN OK (rolled back), would write' : 'OK'} v${version}`)
    } catch (error) {
      failOrDefer(step, id, reason(error), places.get(id) ?? {})
      continue
    }
    if (!state) continue
    // A dry run rolls a new template's content back, so its state has nothing to be checked against.
    if (staged.templates.has(id)) {
      run.report(`${id} state not checked: new on the target, checked when written`)
      continue
    }
    try {
      run.report(`${id} state ${await syncTemplateState(id, state, actor, run.target, run.validateOnly)}`)
    } catch (error) {
      step.fail(`${id} state ${reason(error)}`)
    }
  }
}

// True when every step succeeded (a deferred dry-run check is not a failure).
export async function runSync(request: SyncRequest, run: Run): Promise<boolean> {
  let ok = true
  const fail = (line: string) => {
    ok = false
    run.report(line)
  }
  const step: Step = { run, fail, staged: stageNothing() }
  const read = await readAll(unique(request.seriesSlugs), run, fail)
  await deletions(read.filter(item => item.deleted), run, fail)
  const series = read.filter(item => !item.deleted)
  const ids = unique([...request.templateIds, ...series.flatMap((item) => item.members)])
  await categories(series, ids, step)
  const defined = await definitions(series, step)
  await seriesActive(defined, false, step)
  const goneHere = await readDeletedIds(ids, run.target).catch((error: unknown) => {
    fail(`deleted ${reason(error)}`)
    return new Set<string>()
  })
  await templates(ids, goneHere, step)
  await members(defined, goneHere, step)
  await seriesActive(defined, true, step)
  return ok
}
