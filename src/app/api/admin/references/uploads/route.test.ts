import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AppError } from '@/core/errors'

const { requireAdmin, origin, store } = vi.hoisted(() => ({ requireAdmin: vi.fn(), origin: vi.fn(), store: vi.fn() }))
vi.mock('@/core/auth', () => ({ assertSameOrigin: origin, requireApiAdmin: requireAdmin, createAdminSupabase: vi.fn() }))
vi.mock('@/core/storage', () => ({ r2Store: store }))
const { POST, PATCH } = await import('./route')
const request = () => new NextRequest('https://localhost/api/admin/references/uploads', { method: 'POST' })

describe('reference upload authorization', () => {
  afterEach(() => vi.resetAllMocks())

  it.each([POST, PATCH])('denies ordinary users before issuing a URL or accessing storage', async handler => {
    requireAdmin.mockRejectedValue(new AppError('NOT_FOUND', 'Not found'))
    const response = await handler(request())
    expect(response.status).toBe(404)
    expect(store).not.toHaveBeenCalled()
  })

  it.each([POST, PATCH])('denies cross-origin writes', async handler => {
    origin.mockImplementation(() => { throw new AppError('FORBIDDEN', 'Bad origin') })
    expect((await handler(request())).status).toBe(403)
    expect(requireAdmin).not.toHaveBeenCalled()
  })
})
