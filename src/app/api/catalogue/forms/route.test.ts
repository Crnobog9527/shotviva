import { NextRequest } from 'next/server'
import { beforeEach, expect, it, vi } from 'vitest'

import { AppError } from '@/core/errors'

const { requireApiUser, loadCatalogueForms } = vi.hoisted(() => ({ requireApiUser: vi.fn(), loadCatalogueForms: vi.fn() }))
vi.mock('@/core/auth', () => ({ requireApiUser }))
vi.mock('@/modules/image', () => ({ loadCatalogueForms }))

const { GET } = await import('./route')
const request = (query: string) => new NextRequest(`https://example.com/api/catalogue/forms?${query}`)

beforeEach(() => requireApiUser.mockResolvedValue({ id: 'member' }))

it('requires a verified session before reading any forms', async () => {
  requireApiUser.mockRejectedValueOnce(new AppError('UNAUTHORIZED', 'Sign in first'))
  expect((await GET(request('locale=zh&id=card'))).status).toBe(401)
  expect(loadCatalogueForms).not.toHaveBeenCalled()
})

it('returns the requested localised forms in a private response', async () => {
  loadCatalogueForms.mockResolvedValueOnce({ card: { copyFields: [], toggles: [] } })
  const response = await GET(request('locale=zh&id=card'))
  expect(response.status).toBe(200)
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(loadCatalogueForms).toHaveBeenCalledExactlyOnceWith('zh', ['card'])
  await expect(response.json()).resolves.toEqual({ card: { copyFields: [], toggles: [] } })
})

it('rejects an invalid locale or empty selection', async () => {
  expect((await GET(request('locale=es&id=card'))).status).toBe(422)
  expect((await GET(request('locale=zh'))).status).toBe(422)
  expect(loadCatalogueForms).not.toHaveBeenCalled()
})
