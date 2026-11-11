import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppError } from '@/core/errors'

const mocks = vi.hoisted(() => ({ requireApiUser: vi.fn(), resolveJobThumb: vi.fn() }))

vi.mock('@/core/auth', () => ({ requireApiUser: mocks.requireApiUser, createAdminSupabase: () => ({}) }))
vi.mock('@/core/storage', () => ({ r2Store: () => ({}) }))
vi.mock('@/core/jobs', () => ({ resolveJobThumb: mocks.resolveJobThumb }))

const { GET } = await import('./route')

const call = () => GET(new NextRequest('http://localhost:3000/api/files/j1/thumb'), { params: Promise.resolve({ jobId: 'j1' }) })

describe('GET /api/files/[jobId]/thumb', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireApiUser.mockResolvedValue({ id: 'u1' })
  })

  it('needs a session', async () => {
    mocks.requireApiUser.mockRejectedValue(new AppError('UNAUTHORIZED', 'Sign in first'))
    expect((await call()).status).toBe(401)
    expect(mocks.resolveJobThumb).not.toHaveBeenCalled()
  })

  it('needs a verified account', async () => {
    mocks.requireApiUser.mockRejectedValue(new AppError('FORBIDDEN', 'Verify your email or phone first'))
    expect((await call()).status).toBe(403)
    expect(mocks.resolveJobThumb).not.toHaveBeenCalled()
  })

  it('redirects the caller to the signed small copy, uncached, and returns no bytes', async () => {
    mocks.resolveJobThumb.mockResolvedValue('https://r2.example/signed-thumb')
    const response = await call()
    expect(mocks.resolveJobThumb).toHaveBeenCalledWith(expect.anything(), { userId: 'u1', jobId: 'j1' })
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://r2.example/signed-thumb')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect((await response.arrayBuffer()).byteLength).toBe(0)
  })

  it('redirects to the full-file route on this site when there is no small copy', async () => {
    mocks.resolveJobThumb.mockResolvedValue('/api/files/j1')
    const response = await call()
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('http://localhost:3000/api/files/j1')
  })

  it('answers 404 for non-owners and unknown jobs', async () => {
    mocks.resolveJobThumb.mockRejectedValue(new AppError('NOT_FOUND', 'Not found'))
    expect((await call()).status).toBe(404)
  })
})
