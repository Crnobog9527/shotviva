import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { loadLast, peekLast } = await import('./load-last')

const USER = '11111111-1111-4111-8111-111111111111'
const SET = '44444444-4444-4444-8444-444444444444'
const job = (n: number, inputs: Record<string, unknown>, template = 'tournament-poster-red') => ({
  id: `0000000${n}-0000-4000-8000-000000000000`, user_id: USER, module: 'image', template_id: template, parent_job_id: null, inputs,
  provider: 'p', source: 'web', idempotency_key: null, status: 'succeeded', credit_pool: 'paid', visibility: 'private', credits_cost: 120,
  output_key: 'o', error_code: null, created_at: `2026-11-0${n}T10:00:00.000Z`, finished_at: null, deleted_at: null,
})
const kept = (n: number, i: number) => `outputs/${USER}/0000000${n}-0000-4000-8000-000000000000-in-${i}.jpg`

// Newest first, as the query orders them: the info page (QR only), then the prize page.
const page2 = job(7, { poster: { set_id: SET, part: 1 }, input_slots: [{ key: 'qr_code', upload: 'x' }], kept_inputs: [kept(7, 1)] })
const page1 = job(6, { poster: { set_id: SET, part: 0 }, input_slots: [{ key: 'prize_photo', upload: 'a' }, { key: 'qr_code', upload: 'b' }], kept_inputs: [kept(6, 1), kept(6, 2)] })
const content = { header: { brand: '星澜', title: '周赛' }, footer: { phones: ['138'] } }

function fakeDb(works: unknown[]) {
  const asked: string[][] = []
  const jobs = { select: () => jobs, eq: () => jobs, is: () => jobs, order: () => jobs, in: (_: string, ids: string[]) => { asked.push(ids); return jobs }, limit: async () => ({ data: works, error: null }) }
  const sets = { select: () => sets, eq: () => sets, maybeSingle: async () => ({ data: { content }, error: null }) }
  return { db: { from: (table: string) => (table === 'poster_sets' ? sets : jobs) } as never, asked }
}

const store = () => {
  const copies: string[] = []
  return {
    copies,
    store: { head: async () => ({ size: 10, contentType: 'image/jpeg' }), copy: async (from: string) => { copies.push(from) }, presignGet: async (key: string) => `https://r2/${key}` } as never,
  }
}

describe('peekLast', () => {
  it('names the newest finished work of the template or its series, copying nothing', async () => {
    const { db, asked } = fakeDb([page2, page1])
    await expect(peekLast(db, USER, ['tournament-poster-red', 'tournament-poster-purple'])).resolves.toEqual({ jobId: page2.id, templateId: 'tournament-poster-red', madeAt: page2.created_at })
    expect(asked).toEqual([['tournament-poster-red', 'tournament-poster-purple']])
    await expect(peekLast(fakeDb([]).db, USER, ['x'])).resolves.toBeNull()
  })
})

describe('loadLast', () => {
  it('takes a poster set\'s text, and each slot\'s kept photo once across its pages', async () => {
    const { db } = fakeDb([page2, page1])
    const r2 = store()
    const last = await loadLast({ db, store: () => r2.store }, USER, ['tournament-poster-red'])
    expect(last).toMatchObject({ kind: 'poster', jobId: page2.id, content })
    expect(last?.photos.map((photo) => photo.slot)).toEqual(['qr_code', 'prize_photo'])
    expect(r2.copies).toEqual([kept(7, 1), kept(6, 1), kept(6, 2)])
  })

  it('gives a plain template\'s form fields and kept slot photos', async () => {
    const work = job(5, { copy: { venue: '星澜' }, aspect_ratio: '3:4', resolution: '2k', input_slots: [{ key: 'logo', upload: 'l' }], kept_inputs: [kept(5, 1)], style_ref_keys: ['private'] }, 'prize-poster-receipt')
    const last = await loadLast({ db: fakeDb([work]).db, store: () => store().store }, USER, ['prize-poster-receipt'])
    expect(last).toMatchObject({ kind: 'form', inputs: { copy: { venue: '星澜' }, aspect_ratio: '3:4', resolution: '2k' }, photos: [{ slot: 'logo' }] })
    expect(JSON.stringify(last)).not.toContain('style_ref_keys')
  })
})
