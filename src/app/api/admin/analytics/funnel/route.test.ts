import { beforeEach, expect, it, vi } from 'vitest'

import { GET } from './route'

const { guard, read, bucket } = vi.hoisted(() => ({ guard: vi.fn(), read: vi.fn(), bucket: 600_000 }))
vi.mock('@/core/auth', () => ({ requireAdmin: guard }))
vi.mock('server-only', () => ({}))
vi.mock('@/core/admin/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/admin/analytics')>()),
  posthogProjectId: () => 'test',
  funnelResponse: read,
}))

beforeEach(() => {
  vi.clearAllMocks()
})

const req = (params: string) => new Request('https://example.test/api/admin/analytics/funnel?' + params)
const valid = () => req('range=7d&group=visitor&end=' + Math.floor(Date.now() / bucket) * bucket)

it('authorizes before calling either cache or analytics', async () => {
  guard.mockRejectedValueOnce(new Error('404'))
  await expect(GET(valid())).rejects.toThrow('404')
  expect(read).not.toHaveBeenCalled()
})

it('rejects arbitrary cache keys and responds privately to valid requests', async () => {
  expect((await GET(req('range=7d&group=visitor&end=1'))).status).toBe(400)
  expect(read).not.toHaveBeenCalled()
  read.mockResolvedValueOnce(null).mockResolvedValueOnce({ data: {}, end: bucket, link: 'link' })
  expect((await GET(valid())).status).toBe(503)
  const ok = await GET(valid())
  expect(ok.status).toBe(200)
  expect(ok.headers.get('Cache-Control')).toBe('private, no-store')
})
