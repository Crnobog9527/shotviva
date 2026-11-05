import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppError } from '@/core/errors'

const mocks = vi.hoisted(() => ({ requireApiUser: vi.fn(), resolveJobFile: vi.fn() }))

vi.mock('@/core/auth', () => ({ requireApiUser: mocks.requireApiUser, createAdminSupabase: () => ({}) }))
vi.mock('@/core/storage', () => ({ r2Store: () => ({}) }))
vi.mock('@/core/jobs', () => ({ resolveJobFile: mocks.resolveJobFile }))

const { GET } = await import('./route')

const call = (query = '') =>
  GET(new NextRequest(`http://localhost:3000/api/files/j1${query}`), { params: Promise.resolve({ jobId: 'j1' }) })

describe('GET /api/files/[jobId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireApiUser.mockResolvedValue({ id: 'u1' })
  })

  it('needs a session', async () => {
    mocks.requireApiUser.mockRejectedValue(new AppError('UNAUTHORIZED', 'Sign in first'))
    expect((await call()).status).toBe(401)
    expect(mocks.resolveJobFile).not.toHaveBeenCalled()
  })

  it('redirects clean files to the signed URL, uncached', async () => {
    mocks.resolveJobFile.mockResolvedValue({ kind: 'redirect', url: 'https://r2.example/signed' })
    const response = await call()
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://r2.example/signed')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('streams watermarked bytes, as an attachment on ?download=1', async () => {
    mocks.resolveJobFile.mockResolvedValue({ kind: 'bytes', body: new Uint8Array([1, 2]), contentType: 'image/jpeg', filename: 'shotviva-j1.jpg' })
    const response = await call('?download=1')
    expect(mocks.resolveJobFile).toHaveBeenCalledWith(expect.anything(), { userId: 'u1', jobId: 'j1', download: true })
    expect(response.headers.get('content-type')).toBe('image/jpeg')
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="shotviva-j1.jpg"')
  })

  it('answers 404 for non-owners', async () => {
    mocks.resolveJobFile.mockRejectedValue(new AppError('NOT_FOUND', 'Not found'))
    expect((await call()).status).toBe(404)
  })
})
