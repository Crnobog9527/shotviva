import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { companyScope, listCompanyPhotos } = await import('./photos')

const USER = '11111111-1111-4111-8111-111111111111'
const PEER = '22222222-2222-4222-8222-222222222222'

describe('companyScope', () => {
  it('reads the address\'s filter; anything unknown is everyone', () => {
    expect(companyScope(null)).toEqual({ p_scope: 'all', p_member: null })
    expect(companyScope('me')).toEqual({ p_scope: 'mine', p_member: null })
    expect(companyScope('personal')).toEqual({ p_scope: 'personal', p_member: null })
    expect(companyScope('deleted')).toEqual({ p_scope: 'archived', p_member: null })
    expect(companyScope(PEER)).toEqual({ p_scope: 'member', p_member: PEER })
    expect(companyScope("x' or 1=1")).toEqual({ p_scope: 'all', p_member: null })
  })
})

const work = (n: number) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, user_id: PEER, org_work: true, archived: false, template_id: 't',
  template_name: 'T', created_at: `2026-11-28T06:00:${String(59 - (n % 60)).padStart(2, '0')}.000000+00:00`, aspect_ratio: null, member_active: true,
})

describe('listCompanyPhotos', () => {
  it('reads one page and one more to know whether older works remain', async () => {
    const rpc = vi.fn(async (fn: string) => ({ data: fn === 'org_member_photos_count' ? 60 : Array.from({ length: 49 }, (_, n) => work(n)), error: null }))
    const page = await listCompanyPhotos({ rpc } as never, USER)
    expect(page.works).toHaveLength(48)
    expect(page.total).toBe(60)
    expect(page.next).toEqual({ createdAt: work(47).created_at, id: work(47).id })
    expect(rpc).toHaveBeenCalledWith('org_member_photos', { p_user: USER, p_scope: 'all', p_member: null, p_limit: 49 })
  })

  it('with a cursor, reads everything down to it and the page after it, always as the session\'s user', async () => {
    const until = { createdAt: '2026-11-28T05:00:00.000000+00:00', id: work(7).id }
    const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => ({ data: fn === 'org_member_photos_count' ? 3 : 'p_from_at' in args ? [work(1), work(2)] : [work(3)], error: null }))
    const page = await listCompanyPhotos({ rpc } as never, USER, { filter: PEER, until })
    expect(page.works.map((w) => w.id)).toEqual([work(1).id, work(2).id, work(3).id])
    expect(page.next).toBeNull()
    expect(rpc).toHaveBeenCalledWith('org_member_photos', { p_user: USER, p_scope: 'member', p_member: PEER, p_limit: 1000, p_from_at: until.createdAt, p_from_id: until.id })
    expect(rpc).toHaveBeenCalledWith('org_member_photos', { p_user: USER, p_scope: 'member', p_member: PEER, p_limit: 49, p_before_at: until.createdAt, p_before_id: until.id })
  })
})
