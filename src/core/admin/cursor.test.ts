import { describe, expect, it } from 'vitest'

import { afterCursor, decodeCursor, encodeCursor, PAGE_SIZE, toPage } from './cursor'

const row = (n: number) => ({ id: String(n), created_at: `2026-11-06T00:00:${String(n % 60).padStart(2, '0')}+00:00` })

describe('admin cursor', () => {
  it('round-trips and treats junk as the first page', () => {
    const cursor = encodeCursor({ id: 42, created_at: '2026-11-06T01:02:03.456+00:00' })
    expect(decodeCursor(cursor)).toEqual({ c: '2026-11-06T01:02:03.456+00:00', i: '42' })
    expect(decodeCursor('not-a-cursor')).toBeNull()
    expect(decodeCursor(Buffer.from('{"c":"x","i":"a b"}').toString('base64url'))).toBeNull()
    expect(decodeCursor(Buffer.from('{"c":"x","i":"1),or(id.gt.0"}').toString('base64url'))).toBeNull()
    expect(decodeCursor(encodeCursor({ id: 'sub_1AbC', created_at: '2026-11-06T00:00:00+00:00' }))?.i).toBe('sub_1AbC')
    expect(decodeCursor(null)).toBeNull()
    expect(decodeCursor(Buffer.from('{"c":"x\\",id.gt.0","i":"1"}').toString('base64url'))).toBeNull()
  })

  it('builds the keyset filter for (created_at desc, id desc)', () => {
    expect(afterCursor({ c: '2026-11-06T00:00:00+00:00', i: '7' })).toBe(
      'created_at.lt."2026-11-06T00:00:00+00:00",and(created_at.eq."2026-11-06T00:00:00+00:00",id.lt.7)',
    )
    expect(afterCursor({ c: 't', i: 'sub_1' }, 'stripe_subscription_id')).toBe(
      'created_at.lt."t",and(created_at.eq."t",stripe_subscription_id.lt.sub_1)',
    )
  })

  it('cuts one page and only offers a next cursor when there is more', () => {
    const full = Array.from({ length: PAGE_SIZE + 1 }, (_, n) => row(n))
    const page = toPage(full, (r) => r.id)
    expect(page.items).toHaveLength(PAGE_SIZE)
    expect(decodeCursor(page.nextCursor)?.i).toBe(String(PAGE_SIZE - 1))
    expect(toPage(full.slice(0, 3), (r) => r.id).nextCursor).toBeNull()
  })
})
