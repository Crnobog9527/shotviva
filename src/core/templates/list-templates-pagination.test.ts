import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./types', async (original) => ({ ...(await original<typeof import('./types')>()), toTemplate: (row: unknown) => row }))
const { listTemplates } = await import('./list-templates')

describe('public catalogue pagination', () => {
  it('reads every page beyond the row limit even when an unseen template moves to the front', async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => ({
      id: `template-${i.toString().padStart(4, '0')}`, sort_order: i,
    }))
    const fetchPage = vi.fn(async (after: string | null, limit: number) => {
      if (after) rows[1000].sort_order = -1
      return { data: rows.filter((row) => after === null || row.id > after).slice(0, limit), error: null }
    })
    const client = { rpc: () => {
      let after: string | null = null
      let limit = 0
      const query = {
        select: () => query,
        order: () => query,
        gt: (_column: string, value: string) => { after = value; return query },
        limit: (value: number) => { limit = value; return query },
        returns: () => fetchPage(after, limit),
      }
      return query
    } } as unknown as SupabaseClient
    const result = await listTemplates(client, 'web')
    expect(result).toHaveLength(1001)
    expect(new Set(result.map((row) => row.id)).size).toBe(1001)
    expect(result[0]?.id).toBe('template-1000')
    expect(fetchPage.mock.calls).toEqual([[null, 500], ['template-0499', 500], ['template-0999', 500]])
  })
})
