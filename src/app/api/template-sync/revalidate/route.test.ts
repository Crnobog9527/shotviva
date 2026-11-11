import { beforeEach, expect, it, vi } from 'vitest'

const { invalidate, env } = vi.hoisted(() => ({ invalidate: vi.fn(), env: { TEMPLATE_SYNC_REVALIDATE_SECRET: 'sync-fixture' as string | undefined } }))
vi.mock('@/core/env', () => ({ serverEnv: () => env }))
vi.mock('@/core/templates', () => ({ TEMPLATES_CACHE_TAG: 'templates' }))
vi.mock('next/cache', () => ({ revalidateTag: invalidate }))

const route = await import('./route')
const req = (value: string) => new Request('https://site.test/api/template-sync/revalidate', { method: 'POST', headers: { authorization: value } })

beforeEach(() => {
  vi.clearAllMocks()
  env.TEMPLATE_SYNC_REVALIDATE_SECRET = 'sync-fixture'
})

it('expires the template catalogue at once for the workflow’s secret', async () => {
  const response = await route.POST(req('Bearer sync-fixture'))
  expect(response.status).toBe(200)
  expect(invalidate).toHaveBeenCalledExactlyOnceWith('templates', { expire: 0 })
})

it('refuses a missing or wrong secret, and everything while the secret is unset', async () => {
  for (const token of ['', 'Bearer wrong', 'sync-fixture', 'Bearer sync-fixture2']) expect((await route.POST(req(token))).status).toBe(401)
  env.TEMPLATE_SYNC_REVALIDATE_SECRET = undefined
  expect((await route.POST(req('Bearer '))).status).toBe(401)
  expect((await route.POST(req('Bearer undefined'))).status).toBe(401)
  expect(invalidate).not.toHaveBeenCalled()
})

it('answers POST only', () => {
  expect(Object.keys(route)).toEqual(['POST'])
})
