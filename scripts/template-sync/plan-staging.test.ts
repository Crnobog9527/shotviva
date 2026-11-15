import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SyncError } from './covers'
import type { SeriesSnapshot } from './series'

// A production → preview dry run (2026-11-15): production has a category tree, a series and its
// templates that the preview lacks. Each step is checked and rolled back on its own, so the later
// steps see their prerequisites missing; those checks are deferred, not failed.
const steps = vi.hoisted(() => ({
  readSeries: vi.fn(), syncSeriesDefinition: vi.fn(), syncSeriesMembers: vi.fn(), syncSeriesDelete: vi.fn(),
  syncCategories: vi.fn(), templateCategoryKeys: vi.fn(), syncTemplate: vi.fn(),
  readStates: vi.fn(), readDeletedIds: vi.fn(), syncTemplateState: vi.fn(), syncSeriesActive: vi.fn(),
  absentOn: vi.fn(), templatePlaces: vi.fn(),
}))
vi.mock('./series', () => ({ readSeries: steps.readSeries, syncSeriesDefinition: steps.syncSeriesDefinition, syncSeriesMembers: steps.syncSeriesMembers, syncSeriesDelete: steps.syncSeriesDelete }))
vi.mock('./categories', () => ({ syncCategories: steps.syncCategories, templateCategoryKeys: steps.templateCategoryKeys }))
vi.mock('./sync', () => ({ syncTemplate: steps.syncTemplate }))
vi.mock('./state', () => ({ readStates: steps.readStates, readDeletedIds: steps.readDeletedIds, syncTemplateState: steps.syncTemplateState, syncSeriesActive: steps.syncSeriesActive }))
vi.mock('./staging', async (original) => ({ ...await original<typeof import('./staging')>(), absentOn: steps.absentOn, templatePlaces: steps.templatePlaces }))

const { runSync } = await import('./plan')

const source = { id: 'production' } as never
const target = { id: 'preview' } as never
const hotelSeries: SeriesSnapshot = {
  series: { slug: 'hotel-set', name_en: 'Hotel', name_zh: '酒店', description_en: null, description_zh: null, cover_url: null,
    category_key: 'hotel', sort_order: 0, is_active: true, show_members: false },
  members: ['hotel-1', 'hotel-2'], deleted: false,
}

function run(validateOnly: boolean) {
  const lines: string[] = []
  return { lines, options: { runId: '9', actorId: 'actor', source, target, validateOnly, report: (line: string) => lines.push(line) } }
}

beforeEach(() => {
  steps.readSeries.mockReset().mockResolvedValue(hotelSeries)
  steps.templateCategoryKeys.mockReset().mockResolvedValue(['hotel'])
  // travel is the new root, hotel its new child: hotel's own check misses its rolled-back parent.
  steps.syncCategories.mockReset().mockResolvedValue([
    { key: 'travel', parent: null, result: 'created' },
    { key: 'hotel', parent: 'travel', error: 'CATEGORY_PARENT_MISSING' },
  ])
  steps.syncSeriesDefinition.mockReset().mockRejectedValue(new SyncError('SERIES_CATEGORY_MISSING'))
  steps.syncTemplate.mockReset().mockRejectedValue(new SyncError('SUBCATEGORY_MISSING'))
  steps.syncSeriesMembers.mockReset().mockResolvedValue({ placed: [], skipped: ['hotel-1', 'hotel-2'] })
  steps.syncSeriesActive.mockReset().mockRejectedValue(new SyncError('SERIES_MISSING'))
  steps.syncTemplateState.mockReset().mockResolvedValue('sale opened, published')
  steps.syncSeriesDelete.mockReset()
  // The preview has none of it; production files both templates under hotel in hotel-set.
  steps.readStates.mockReset().mockImplementation(async (ids: string[], side: unknown) => new Map(side === source
    ? ids.map((id) => [id, { active: true, sale: true, deleted: false }]) : []))
  steps.readDeletedIds.mockReset().mockResolvedValue(new Set())
  steps.absentOn.mockReset().mockImplementation(async (_target: unknown, _kind: string, values: string[]) => new Set(values))
  steps.templatePlaces.mockReset().mockImplementation(async (ids: string[]) => new Map(ids.map((id) => [id, { categories: ['travel', 'hotel'], series: ['hotel-set'] }])))
})

describe('runSync, a dry run into a database without the prerequisites', () => {
  it('defers the checks that only miss what this run creates first, and passes', async () => {
    const { lines, options } = run(true)
    expect(await runSync({ templateIds: [], seriesSlugs: ['hotel-set'] }, options)).toBe(true)
    expect(lines).toContain('category travel created')
    expect(lines).toContain('category hotel CATEGORY_PARENT_MISSING: not checked in a dry run: needs category travel, new in this run (checked when written)')
    expect(lines).toContain('series hotel-set SERIES_CATEGORY_MISSING: not checked in a dry run: needs category hotel, new in this run (checked when written)')
    expect(lines).toContain('hotel-1 SUBCATEGORY_MISSING: not checked in a dry run: needs category travel, category hotel, series hotel-set, new in this run (checked when written)')
    expect(lines).toContain('series hotel-set members not checked in a dry run: the series is new in this run (checked when written)')
    expect(lines).toContain('series hotel-set state not checked in a dry run: the series is new in this run (checked when written)')
    expect(steps.syncSeriesMembers).not.toHaveBeenCalled()
    expect(steps.syncSeriesActive).not.toHaveBeenCalled()
    expect(steps.syncTemplateState).not.toHaveBeenCalled()
  })

  it('still fails a dry run on an error no staged prerequisite explains', async () => {
    steps.syncTemplate.mockReset().mockRejectedValueOnce(new SyncError('MODEL_CREDIT_FLOOR')).mockRejectedValue(new SyncError('SUBCATEGORY_MISSING'))
    const { lines, options } = run(true)
    expect(await runSync({ templateIds: [], seriesSlugs: ['hotel-set'] }, options)).toBe(false)
    expect(lines).toContain('hotel-1 MODEL_CREDIT_FLOOR')
  })

  it('still fails a prerequisite error whose prerequisite is not new in this run', async () => {
    steps.absentOn.mockImplementation(async () => new Set())
    const { lines, options } = run(true)
    expect(await runSync({ templateIds: [], seriesSlugs: ['hotel-set'] }, options)).toBe(false)
    expect(lines).toContain('category hotel CATEGORY_PARENT_MISSING')
  })

  it('defers nothing in a write run: the same errors fail it', async () => {
    const { lines, options } = run(false)
    expect(await runSync({ templateIds: [], seriesSlugs: ['hotel-set'] }, options)).toBe(false)
    expect(lines).toContain('category hotel CATEGORY_PARENT_MISSING')
    expect(steps.absentOn).not.toHaveBeenCalled()
    expect(steps.templatePlaces).not.toHaveBeenCalled()
  })
})
