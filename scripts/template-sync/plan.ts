import { syncCategories, templateCategoryKeys } from './categories'
import { SyncError } from './covers'
import { readSeries, syncSeriesDefinition, syncSeriesDelete, syncSeriesMembers, type SeriesSnapshot } from './series'
import { readDeletedIds, readStates, syncSeriesActive, syncTemplateState } from './state'
import { syncTemplate, type SyncTarget } from './sync'

// One dispatch (2026-11-12): templates by id and whole series by slug, the test site being the only
// source. Series deleted on the test site are deleted on production first (2026-11-14). The order
// then keeps every step's prerequisites in place on production: categories (parents
// first), series definitions, series going down, the templates (content, then sale and publication;
// members included), each series' member order, series going up. So a series is never live without
// its members, and goes down before they do. Every step is its own transaction; a failing item is
// reported and the rest go on, so one bad template does not hold back the series. A dry run
// (validateOnly) rolls every step back.

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

async function categories(series: readonly SeriesSnapshot[], ids: readonly string[], run: Run, fail: (line: string) => void) {
  try {
    const keys = [...series.map((item) => item.series.category_key), ...await templateCategoryKeys(ids, run.source)]
    for (const outcome of await syncCategories(keys, run.source, run.target, run.validateOnly)) {
      if ('error' in outcome) fail(`category ${outcome.key} ${outcome.error}`)
      else run.report(`category ${outcome.key} ${outcome.result}`)
    }
  } catch (error) {
    fail(`categories ${reason(error)}`)
  }
}

async function definitions(series: readonly SeriesSnapshot[], run: Run, fail: (line: string) => void) {
  const defined: SeriesSnapshot[] = []
  for (const item of series) {
    try {
      run.report(`series ${item.series.slug} ${await syncSeriesDefinition(item, run.source, run.target, run.validateOnly)}`)
      defined.push(item)
    } catch (error) {
      const why = reason(error)
      // Deleted on production but not on the test site: production keeps it deleted (1502).
      fail(`series ${item.series.slug} ${why}${why === 'SERIES_DELETED' ? ' on production, not brought back (use a new slug on the test site)' : ''}`)
    }
  }
  return defined
}

// A member deleted on production stays out of the series there (the guard trigger would refuse it).
async function members(series: readonly SeriesSnapshot[], goneHere: ReadonlySet<string>, run: Run, fail: (line: string) => void) {
  for (const item of series) {
    const label = `series ${item.series.slug} members`
    const kept = item.members.filter((id) => !goneHere.has(id))
    if (kept.length < item.members.length) {
      run.report(`${label} SKIPPED deleted on production: ${item.members.filter((id) => goneHere.has(id)).join(' ')}`)
    }
    try {
      const { placed, skipped } = await syncSeriesMembers({ ...item, members: kept }, run.target, run.validateOnly)
      const line = `${label} ${placed.length}/${item.members.length}`
      if (skipped.length > 0) fail(`${line} SKIPPED ${skipped.join(' ')}`)
      else run.report(line)
    } catch (error) {
      fail(`${label} ${reason(error)}`)
    }
  }
}

// 上下架 of each series, in the direction asked (down before the templates, up after them).
async function seriesActive(series: readonly SeriesSnapshot[], active: boolean, run: Run, fail: (line: string) => void) {
  const actor = { id: run.actorId, runId: run.runId }
  for (const item of series.filter((one) => one.series.is_active === active)) {
    try {
      run.report(`series ${item.series.slug} ${await syncSeriesActive(item.series.slug, active, actor, run.target, run.validateOnly)}`)
    } catch (error) {
      fail(`series ${item.series.slug} state ${reason(error)}`)
    }
  }
}

// Each template's content, then its sale and publication as on the test site.
async function templates(ids: readonly string[], goneHere: ReadonlySet<string>, run: Run, fail: (line: string) => void) {
  const actor = { id: run.actorId, runId: run.runId }
  const states = await readStates(ids, run.source).catch((error: unknown) => {
    fail(`states ${reason(error)}`)
    return null
  })
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
      fail(`${id} ${reason(error)}`)
      continue
    }
    if (!state) continue
    try {
      run.report(`${id} state ${await syncTemplateState(id, state, actor, run.target, run.validateOnly)}`)
    } catch (error) {
      fail(`${id} state ${reason(error)}`)
    }
  }
}

// True when every step succeeded.
export async function runSync(request: SyncRequest, run: Run): Promise<boolean> {
  let ok = true
  const fail = (line: string) => {
    ok = false
    run.report(line)
  }
  const read = await readAll(unique(request.seriesSlugs), run, fail)
  await deletions(read.filter(item => item.deleted), run, fail)
  const series = read.filter(item => !item.deleted)
  const ids = unique([...request.templateIds, ...series.flatMap((item) => item.members)])
  await categories(series, ids, run, fail)
  const defined = await definitions(series, run, fail)
  await seriesActive(defined, false, run, fail)
  const goneHere = await readDeletedIds(ids, run.target).catch((error: unknown) => {
    fail(`deleted ${reason(error)}`)
    return new Set<string>()
  })
  await templates(ids, goneHere, run, fail)
  await members(defined, goneHere, run, fail)
  await seriesActive(defined, true, run, fail)
  return ok
}
