import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { saveAnnouncement } from './commands'

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e'

// Records what saveAnnouncement writes; answers like PostgREST.
function fakeDb() {
  const writes: { kind: 'insert' | 'update'; columns: Record<string, unknown> }[] = []
  const done = { select: () => ({ maybeSingle: async () => ({ data: { id: ID }, error: null }), single: async () => ({ data: { id: ID }, error: null }) }) }
  const table = {
    insert: (columns: Record<string, unknown>) => (writes.push({ kind: 'insert', columns }), done),
    update: (columns: Record<string, unknown>) => (writes.push({ kind: 'update', columns }), { eq: () => done }),
  }
  return { db: { from: () => table } as unknown as SupabaseClient, writes }
}

const draft = { messageEn: 'Maintenance tonight', messageZh: '今晚维护', linkUrl: null, linkLabelEn: null, linkLabelZh: null, tone: 'info' }

describe('saveAnnouncement close rule', () => {
  it('leaves the close rule alone when the caller does not send it', async () => {
    const { db, writes } = fakeDb()
    await saveAnnouncement(db, 'admin', { ...draft, id: ID })
    await saveAnnouncement(db, 'admin', draft)
    for (const { columns } of writes) {
      expect(columns).not.toHaveProperty('dismissible')
      expect(columns).not.toHaveProperty('reshow_after_days')
    }
  })

  it('writes the rule the admin picked, including "until changed" (null days)', async () => {
    const { db, writes } = fakeDb()
    await saveAnnouncement(db, 'admin', { ...draft, id: ID, dismissible: false, reshowAfterDays: null })
    expect(writes[0]?.columns).toMatchObject({ dismissible: false, reshow_after_days: null })
  })
})
