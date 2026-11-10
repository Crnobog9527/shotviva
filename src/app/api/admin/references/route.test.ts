import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppError } from '@/core/errors'

const mocks = vi.hoisted(() => ({ origin: vi.fn(), auth: vi.fn(), db: vi.fn() }))
vi.mock('@/core/auth', () => ({ assertSameOrigin: mocks.origin, requireApiAdmin: mocks.auth, createAdminSupabase: mocks.db }))
const { GET: list } = await import('./route')
const { POST: category } = await import('./categories/route')
const { POST: batch } = await import('./batch/route')
const { GET: detail, PATCH: edit } = await import('./[id]/route')
const context = { params: Promise.resolve({ id: 'c3e89a47-a427-43b0-b135-c2e52980381e' }) }
const request = new NextRequest('http://localhost:3000/api/admin/references')
const accountDenied = new AppError('NOT_FOUND', 'Not found')

describe('private reference library HTTP boundary', () => {
  beforeEach(() => { vi.resetAllMocks() })

  it.each([list, detail, category, edit, batch])('checks the admin session before opening the service-role client', async route => {
    mocks.auth.mockRejectedValue(accountDenied)
    const response = await route(request, context)
    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(mocks.db).not.toHaveBeenCalled()
  })

  it.each([category, edit, batch])('requires a same-origin request before applying a change', async route => {
    mocks.origin.mockImplementation(() => { throw new AppError('FORBIDDEN', 'Bad origin') })
    const response = await route(request, context)
    expect(response.status).toBe(403)
    expect(mocks.db).not.toHaveBeenCalled()
  })
})
