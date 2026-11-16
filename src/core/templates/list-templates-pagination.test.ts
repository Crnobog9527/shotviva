import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./types', async (original) => ({ ...(await original<typeof import('./types')>()), toTemplate: (row: unknown) => row }))
const { listTemplates } = await import('./list-templates')

describe('public catalogue pagination', () => {
  it('reads every page beyond the PostgREST row limit', async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => ({ id: `template-${i}` }))
    const range = vi.fn((from: number, to: number) => ({ returns: async () => ({ data: rows.slice(from, to + 1), error: null }) }))
    const query = { select: () => query, order: () => query, range }
    const client = { rpc: () => query } as unknown as SupabaseClient
    const result = await listTemplates(client, 'web')
    expect(result).toHaveLength(1001)
    expect(result.at(-1)?.id).toBe('template-1000')
    expect(range).toHaveBeenCalledTimes(3)
  })
})
