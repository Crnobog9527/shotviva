import { NextRequest } from 'next/server'
import { describe, expect, it, vi } from 'vitest'

import { AppError } from '@/core/errors'

const { store, requireAdmin } = vi.hoisted(() => ({ store: vi.fn(), requireAdmin: vi.fn() }))
vi.mock('@/core/auth', () => ({ assertSameOrigin: () => {}, requireApiAdmin: requireAdmin }))
vi.mock('@/core/storage', () => ({ r2Store: store }))
const { GET, PATCH, POST } = await import('./route')

describe('admin only style reference endpoints', () => {
  it.each([GET, POST, PATCH])('rejects a non-admin before minting tickets or reading private objects', async handler => {
    requireAdmin.mockRejectedValue(new AppError('NOT_FOUND', 'Not found'))
    const response = await handler(new NextRequest('http://localhost/api/admin/style-refs'))
    expect(response.status).toBe(404)
    expect(store).not.toHaveBeenCalled()
    expect(response.headers.get('location')).toBeNull()
    expect(await response.text()).not.toMatch(/style-refs|X-Amz-/)
  })
})
