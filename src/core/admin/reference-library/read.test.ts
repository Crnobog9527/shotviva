import { createClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import { encodeCursor } from '../cursor'
import { referencePage } from './read'

describe('reference library list request', () => {
  it('matches literal punctuation in notes and tags and pages oldest-first using both cursor columns', async () => {
    const http = vi.fn<typeof fetch>().mockResolvedValue(Response.json([]))
    const db = createClient('http://127.0.0.1:54321', 'local-test', { global: { fetch: http } })
    const id = '70ba2963-8fb9-4a99-9230-10f4f5e9a390'
    const time = '2026-11-10T00:00:00Z'
    const result = await referencePage(db, {
      tag: 'a,"b', note: '10% (A)*', cursor: encodeCursor({ id, created_at: time }), sort: 'oldest',
    })
    expect(result).toEqual({ items: [], nextCursor: null })
    const query = new URL(String(http.mock.calls[0][0])).searchParams
    expect(query.get('tags')).toBe('cs.{"a,\\"b"}')
    expect(query.get('note')).toBe('imatch.10% \\(A\\)\\*')
    expect(query.get('or')).toBe(`(created_at.gt."${time}",and(created_at.eq."${time}",id.gt.${id}))`)
    expect(query.get('limit')).toBe('61')
  })
})
