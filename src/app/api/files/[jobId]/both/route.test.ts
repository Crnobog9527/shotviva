import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppError } from '@/core/errors'

const mocks = vi.hoisted(() => ({ requireApiUser: vi.fn(), resolveJobPair: vi.fn(), recordJobDownload: vi.fn() }))

vi.mock('@/core/auth', () => ({ requireApiUser: mocks.requireApiUser, createAdminSupabase: () => ({}), clientIp: () => '203.0.113.7' }))
vi.mock('@/core/storage', () => ({ r2Store: () => ({}) }))
vi.mock('@/core/jobs', () => ({ resolveJobPair: mocks.resolveJobPair, recordJobDownload: mocks.recordJobDownload }))
vi.mock('next/server', async (importOriginal) => ({ ...(await importOriginal<object>()), after: (work: () => unknown) => work() }))

const { GET } = await import('./route')

const call = () => GET(new NextRequest('http://localhost:3000/api/files/j1/both'), { params: Promise.resolve({ jobId: 'j1' }) })

describe('GET /api/files/[jobId]/both', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireApiUser.mockResolvedValue({ id: 'u1' })
  })

  it('needs a session', async () => {
    mocks.requireApiUser.mockRejectedValue(new AppError('UNAUTHORIZED', 'Sign in first'))
    expect((await call()).status).toBe(401)
    expect(mocks.resolveJobPair).not.toHaveBeenCalled()
  })

  it('redirects to the signed ZIP and records one download for the click', async () => {
    mocks.resolveJobPair.mockResolvedValue({ kind: 'redirect', url: 'https://r2.example/both.zip' })
    const response = await call()
    expect(mocks.resolveJobPair).toHaveBeenCalledWith(expect.anything(), { userId: 'u1', jobId: 'j1' })
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://r2.example/both.zip')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.recordJobDownload).toHaveBeenCalledTimes(1)
    expect(mocks.recordJobDownload).toHaveBeenCalledWith(expect.anything(), { userId: 'u1', jobId: 'j1', ip: '203.0.113.7' })
  })

  it('404s for someone else’s work or an opaque one, recording nothing', async () => {
    mocks.resolveJobPair.mockRejectedValue(new AppError('NOT_FOUND', 'Not found'))
    expect((await call()).status).toBe(404)
    expect(mocks.recordJobDownload).not.toHaveBeenCalled()
  })
})
