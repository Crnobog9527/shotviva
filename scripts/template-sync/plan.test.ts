import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SyncError } from './covers'
import type { SeriesSnapshot } from './series'

// Each step mocked; the test is about order, what reaches each step, and how failures are reported.
const calls: string[] = []
const steps = vi.hoisted(() => ({
  readSeries: vi.fn(), syncSeriesDefinition: vi.fn(), syncSeriesMembers: vi.fn(),
  syncCategories: vi.fn(), templateCategoryKeys: vi.fn(), syncTemplate: vi.fn(),
}))
vi.mock('./series', () => ({ readSeries: steps.readSeries, syncSeriesDefinition: steps.syncSeriesDefinition, syncSeriesMembers: steps.syncSeriesMembers }))
vi.mock('./categories', () => ({ syncCategories: steps.syncCategories, templateCategoryKeys: steps.templateCategoryKeys }))
vi.mock('./sync', () => ({ syncTemplate: steps.syncTemplate }))

const { runSync } = await import('./plan')

const snapshot = (slug: string, members: string[]): SeriesSnapshot => ({
  series: { slug, name_en: slug, name_zh: slug, description_en: null, description_zh: null, cover_url: null,
    category_key: `cat-${slug}`, sort_order: 0, is_active: true, show_members: false },
  members,
})
const side = {} as never

function run(validateOnly = false) {
  const lines: string[] = []
  return { lines, options: { runId: '9', source: side, target: side, validateOnly, report: (line: string) => lines.push(line) } }
}

beforeEach(() => {
  calls.length = 0
  steps.readSeries.mockReset().mockImplementation(async (slug: string) => snapshot(slug, [`${slug}-1`, `${slug}-2`]))
  steps.templateCategoryKeys.mockReset().mockImplementation(async (ids: string[]) => ids.map((id) => `cat-of-${id}`))
  steps.syncCategories.mockReset().mockImplementation(async (keys: string[]) => {
    calls.push(`categories ${keys.join(',')}`)
    return keys.map((key) => ({ key, result: 'unchanged' }))
  })
  steps.syncSeriesDefinition.mockReset().mockImplementation(async (item: SeriesSnapshot) => {
    calls.push(`series ${item.series.slug}`)
    return 'created'
  })
  steps.syncTemplate.mockReset().mockImplementation(async (id: string) => {
    calls.push(`template ${id}`)
    return 1
  })
  steps.syncSeriesMembers.mockReset().mockImplementation(async (item: SeriesSnapshot) => {
    calls.push(`members ${item.series.slug}`)
    return { placed: item.members, skipped: [] }
  })
})

describe('runSync', () => {
  it('goes categories → series → templates → member order, each template once', async () => {
    const { lines, options } = run()
    expect(await runSync({ templateIds: ['solo', 'set-1'], seriesSlugs: ['set'] }, options)).toBe(true)
    expect(calls).toEqual([
      'categories cat-set,cat-of-solo,cat-of-set-1,cat-of-set-2',
      'series set', 'template solo', 'template set-1', 'template set-2', 'members set',
    ])
    expect(lines).toContain('series set members 2/2')
  })

  it('passes the dry run to every step', async () => {
    const { options } = run(true)
    await runSync({ templateIds: [], seriesSlugs: ['set'] }, options)
    expect(steps.syncCategories.mock.calls[0]?.[3]).toBe(true)
    expect(steps.syncSeriesDefinition.mock.calls[0]?.[3]).toBe(true)
    expect(steps.syncTemplate.mock.calls.every((call) => call[4] === true)).toBe(true)
    expect(steps.syncSeriesMembers.mock.calls[0]?.[2]).toBe(true)
  })

  it('reports each failure by its reason and carries on; a series that failed gets no member step', async () => {
    steps.readSeries.mockImplementation(async (slug: string) => {
      if (slug === 'gone') throw new SyncError('SERIES_SOURCE_MISSING')
      return snapshot(slug, [`${slug}-1`])
    })
    steps.syncSeriesDefinition.mockRejectedValueOnce(new SyncError('SERIES_CATEGORY_MISSING'))
    steps.syncTemplate.mockRejectedValueOnce(new Error('secret detail'))
    const { lines, options } = run()
    expect(await runSync({ templateIds: [], seriesSlugs: ['gone', 'bad', 'ok'] }, options)).toBe(false)
    expect(lines).toEqual(expect.arrayContaining([
      'series gone SERIES_SOURCE_MISSING', 'series bad SERIES_CATEGORY_MISSING', 'bad-1 SYNC_FAILED', 'series ok members 1/1',
    ]))
    expect(calls).not.toContain('members bad')
  })

  it('fails the run when a listed member could not be placed', async () => {
    steps.syncSeriesMembers.mockResolvedValueOnce({ placed: ['set-1'], skipped: ['set-2'] })
    const { lines, options } = run()
    expect(await runSync({ templateIds: [], seriesSlugs: ['set'] }, options)).toBe(false)
    expect(lines).toContain('series set members 1/2 SKIPPED set-2')
  })
})
