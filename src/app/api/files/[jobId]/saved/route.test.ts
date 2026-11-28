import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppError } from '@/core/errors'

const mocks = vi.hoisted(() => ({ requireApiUser: vi.fn(), recordJobDownload: vi.fn() }))

vi.mock('@/core/auth', () => ({ requireApiUser: mocks.requireApiUser, createAdminSupabase: () => ({}), clientIp: () => '203.0.113.7' }))
vi.mock('@/core/jobs', () => ({ recordJobDownload: mocks.recordJobDownload }))

const { POST } = await import('./route')

const JOB = '11111111-1111-4111-8111-111111111111'
const call = (jobId = JOB) =>
  POST(new NextRequest(`http://localhost:3000/api/files/${jobId}/saved`, { method: 'POST' }), { params: Promise.resolve({ jobId }) })

describe('POST /api/files/[jobId]/saved', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireApiUser.mockResolvedValue({ id: 'u1' })
  })

  it('needs a session', async () => {
    mocks.requireApiUser.mockRejectedValue(new AppError('UNAUTHORIZED', 'Sign in first'))
    expect((await call()).status).toBe(401)
    expect(mocks.recordJobDownload).not.toHaveBeenCalled()
  })

  it('notes one download for the caller, with their IP, and sends nothing back', async () => {
    const response = await call()
    expect(response.status).toBe(204)
    expect(mocks.recordJobDownload).toHaveBeenCalledTimes(1)
    expect(mocks.recordJobDownload).toHaveBeenCalledWith(expect.anything(), { userId: 'u1', jobId: JOB, ip: '203.0.113.7' })
  })

  it('refuses anything that is not a work id', async () => {
    expect((await call('not-an-id')).status).toBe(404)
    expect(mocks.recordJobDownload).not.toHaveBeenCalled()
  })
})
