import { beforeEach, describe, expect, it, vi } from 'vitest'

const cacheLife = vi.fn()
vi.mock('next/cache', () => ({ cacheLife, cacheTag: () => undefined }))
vi.mock('../auth/supabase-admin', () => ({ createAdminSupabase: () => ({}) }))

const { logger } = await import('../logger')
const { FAILED_READ_LIFE } = await import('../cache-life')
const { CATALOGUE_LIFE } = await import('./cached-catalogue')
const { readPublicSeries, seriesOrEmpty } = await import('./public-series')

// A PostgREST query stand-in: every builder call is recorded and returns the same query, which
// resolves to the table's rows.
function fakeDb(tables: Record<string, unknown[]>) {
  const calls: string[] = []
  const db = {
    from(table: string) {
      const query = {
        then: (resolve: (value: unknown) => void) => resolve({ data: tables[table], error: null }),
      } as Record<string, unknown>
      for (const method of ['select', 'eq', 'not', 'order', 'returns']) {
        query[method] = (...args: unknown[]) => {
          calls.push(`${table}.${method}(${args.map(String).join(',')})`)
          return query
        }
      }
      return query
    },
  }
  return { db: db as never, calls }
}

const SERIES = {
  series_id: 's1',
  entry_series: { id: 's1', slug: 'dark-menu', name_en: 'Dark menu', name_zh: '暗调菜单', description_en: 'Moody', description_zh: null, show_members: false },
}

describe('public series', () => {
  beforeEach(() => {
    cacheLife.mockClear()
    vi.spyOn(logger, 'error').mockImplementation(() => undefined)
  })

  it('reads the visible series in the page language with their live members in series order', async () => {
    const { db, calls } = fakeDb({
      web_catalogue_entries: [SERIES],
      web_template_members: [{ id: 'b', series_id: 's1' }, { id: 'x', series_id: 'other' }, { id: 'a', series_id: 's1' }],
    })
    await expect(readPublicSeries(db, 'zh')).resolves.toEqual([
      { id: 's1', slug: 'dark-menu', name: '暗调菜单', description: null, showMembers: false, memberIds: ['b', 'a'] },
    ])
    expect(calls).toContain('web_catalogue_entries.eq(type,series)')
    expect(calls).toContain('web_template_members.order(series_sort_order)')
  })

  it('shows no series for a minute when the read fails, so members keep their own cards', async () => {
    await expect(seriesOrEmpty('en', async () => Promise.reject(new Error('relation does not exist')))).resolves.toEqual([])
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith(FAILED_READ_LIFE)
    await seriesOrEmpty('en', async () => [])
    expect(cacheLife).toHaveBeenLastCalledWith(CATALOGUE_LIFE)
  })
})
