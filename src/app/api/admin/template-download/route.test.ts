import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppError } from '@/core/errors'

const { requireAdmin, db, coverGet, privateGet } = vi.hoisted(() => ({
  requireAdmin: vi.fn(), db: { from: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() },
  coverGet: vi.fn(), privateGet: vi.fn(),
}))
vi.mock('@/core/auth', () => ({ requireApiAdmin: requireAdmin, createAdminSupabase: () => db }))
vi.mock('@/core/storage', () => ({ r2PublicStore: () => ({ presignGet: coverGet }), r2Store: () => ({ presignGet: privateGet }) }))
vi.mock('@/core/public-env', () => ({ publicEnv: { NEXT_PUBLIC_ASSETS_BASE_URL: 'https://assets.example' } }))
vi.mock('@/modules/image', async () => ({ signTestRunDownload: (await import('@/modules/image/test-run/test-panel')).signTestRunDownload }))
const { GET } = await import('./route')

const hash = 'ab'.repeat(32)
const base = 'https://assets.example/covers/qa/'
const id = '01234567-1234-4234-8234-123456789abc'
const get = (q: string) => GET(new NextRequest('https://example.test/api/admin/template-download?' + q))

beforeEach(() => {
  vi.resetAllMocks()
  db.from.mockReturnValue(db)
  db.select.mockReturnValue(db)
  db.eq.mockReturnValue(db)
  coverGet.mockResolvedValue('https://signed.example/cover')
  privateGet.mockResolvedValue('https://signed.example/run')
})

describe('template file downloads', () => {
  it.each(['runId=' + id, 'templateId=qa&slot=after&locale=common&hash=' + hash])('requires admin before any lookup (%s)', async q => {
    requireAdmin.mockRejectedValue(new AppError('NOT_FOUND', 'Not found'))
    expect((await get(q)).status).toBe(404)
    expect(db.from).not.toHaveBeenCalled()
  })

  it('downloads the exact effective still, preserving a synced JPEG and falling back per slot', async () => {
    const key = `covers/qa/sync-${hash}.jpg`
    db.maybeSingle.mockResolvedValue({ data: { cover_after_url: 'https://assets.example/' + key, cover_locales: { zh: { before: 'other' } } } })
    const response = await get('templateId=qa&slot=after&locale=zh&hash=' + hash)
    expect(response.status).toBe(302)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(coverGet).toHaveBeenCalledWith(key, { expiresInSeconds: 60, downloadName: `qa-zh-after-${hash.slice(0, 16)}.jpg` })
    expect(privateGet).not.toHaveBeenCalled()
  })

  it.each([
    base + 'before-abcdabcdabcdabcd.webp', base + 'motion-abcdabcdabcdabcd.webp',
    base + 'after-1111111111111111.webp', 'https://other.example/covers/qa/after-abcdabcdabcdabcd.webp',
    'https://assets.example/covers/another/after-abcdabcdabcdabcd.webp', base + 'sync-' + hash + '.gif',
  ])('does not sign an invalid or stale after image', async url => {
    db.maybeSingle.mockResolvedValue({ data: { cover_after_url: url, cover_locales: {} } })
    expect((await get('templateId=qa&slot=after&locale=common&hash=abcdabcdabcdabcd')).status).toBe(409)
    expect(coverGet).not.toHaveBeenCalled()
  })

  it('signs only the original PNG of the requested successful run', async () => {
    const key = `admin-tests/outputs/${id}.png`
    db.maybeSingle.mockResolvedValue({ data: { template_id: 'qa', kind: 'edit', output_key: key } })
    expect((await get('runId=' + id)).status).toBe(302)
    expect(db.eq.mock.calls).toEqual([['id', id], ['status', 'succeeded']])
    expect(privateGet).toHaveBeenCalledWith(key, { expiresInSeconds: 60, downloadName: `qa-edit-${id}.png` })
    db.maybeSingle.mockResolvedValue({ data: { output_key: 'uploads-admin/anything' } })
    expect((await get('runId=' + id)).status).toBe(404)
    db.maybeSingle.mockResolvedValue({ data: null })
    expect((await get('runId=' + id)).status).toBe(404)
    expect(privateGet).toHaveBeenCalledTimes(1)
    expect(coverGet).not.toHaveBeenCalled()
  })
})
