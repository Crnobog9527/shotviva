import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppError } from '@/core/errors'

const { requireAdmin, db, head, presignGet } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  db: { from: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() },
  head: vi.fn(),
  presignGet: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/core/auth', () => ({ requireApiAdmin: requireAdmin, createAdminSupabase: () => db }))
vi.mock('@/core/storage', async () => ({
  workThumbKeyFor: (await import('@/core/storage/keys')).workThumbKeyFor,
  r2Store: () => ({ head, presignGet }),
}))
const { GET } = await import('./route')

const job = '01234567-1234-4234-8234-123456789abc'
const user = '11111111-2222-4333-8444-555555555555'
const org = '99999999-2222-4333-8444-555555555555'
const get = (id = job) => GET(new NextRequest(`https://example.test/api/admin/org-works/${id}/thumb`), { params: Promise.resolve({ jobId: id }) })
const row = (over: Record<string, unknown> = {}) => ({
  id: job, user_id: user, org_id: org, status: 'succeeded', output_key: `outputs/${user}/${job}.png`, credit_pool: 'paid', deleted_at: null, ...over,
})

beforeEach(() => {
  vi.resetAllMocks()
  requireAdmin.mockResolvedValue({ id: 'admin' })
  db.from.mockReturnValue(db)
  db.select.mockReturnValue(db)
  db.eq.mockReturnValue(db)
  presignGet.mockImplementation(async (key: string) => `https://signed.example/${key}`)
})

describe('admin org work thumbnails', () => {
  it('answers non-admins 404 before any lookup', async () => {
    requireAdmin.mockRejectedValue(new AppError('NOT_FOUND', 'Not found'))
    expect((await get()).status).toBe(404)
    expect(db.from).not.toHaveBeenCalled()
  })

  it('redirects to the small copy, uncached', async () => {
    db.maybeSingle.mockResolvedValue({ data: row(), error: null })
    head.mockResolvedValue({ size: 1, contentType: 'image/webp' })
    const response = await get()
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(`https://signed.example/outputs/${user}/${job}-thumb.webp`)
    expect(response.headers.get('cache-control')).toContain('no-store')
  })

  it('falls back to the full file for a paid work, never for a free one', async () => {
    head.mockResolvedValue(null)
    db.maybeSingle.mockResolvedValue({ data: row(), error: null })
    expect((await get()).headers.get('location')).toBe(`https://signed.example/outputs/${user}/${job}.png`)
    db.maybeSingle.mockResolvedValue({ data: row({ credit_pool: 'free' }), error: null })
    expect((await get()).status).toBe(404)
  })

  it.each([
    ['a personal work', { org_id: null }],
    ['a failed work', { status: 'failed', output_key: null }],
    ['a deleted work', { deleted_at: '2026-11-20T00:00:00Z' }],
  ])('serves nothing for %s', async (_name, over) => {
    head.mockResolvedValue({ size: 1, contentType: 'image/webp' })
    db.maybeSingle.mockResolvedValue({ data: row(over), error: null })
    expect((await get()).status).toBe(404)
    expect(presignGet).not.toHaveBeenCalled()
  })

  it('treats a malformed id as missing', async () => {
    expect((await get('nope')).status).toBe(404)
    expect(db.from).not.toHaveBeenCalled()
  })
})
