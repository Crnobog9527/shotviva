import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireApiUser: vi.fn(), downloadBatchZip: vi.fn(), recordJobDownload: vi.fn() }))

vi.mock('@/core/auth', () => ({ requireApiUser: mocks.requireApiUser, createAdminSupabase: () => ({}), clientIp: () => '203.0.113.7' }))
vi.mock('@/core/jobs', () => ({ downloadBatchZip: mocks.downloadBatchZip, recordJobDownload: mocks.recordJobDownload }))
// after() needs a request scope; here it runs the callback at once so the test can see it.
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  after: (work: () => unknown) => work(),
}))

const { GET } = await import('./route')

const BATCH = '6d1f3c2a-4b5e-4f60-8a7b-9c0d1e2f3a4b'
const ORIGIN = 'http://localhost:3000'
const PATH = `/api/generate/batch/${BATCH}/download`
const route = (headers: Record<string, string> = {}) =>
  GET(new NextRequest(new URL(PATH, ORIGIN), { headers }), { params: Promise.resolve({ batchId: BATCH }) })
// What the app's Download ZIP sends (modules/image/batch/zip-download.ts requestZip).
const appClick = () => route({ Accept: 'application/json' })

describe('GET /api/generate/batch/[batchId]/download', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireApiUser.mockResolvedValue({ id: 'u1' })
    mocks.downloadBatchZip.mockResolvedValue({ status: 'ready', url: 'https://r2.example/zip', files: [{ jobId: 'j1' }, { jobId: 'j2' }] })
  })

  it('makes one click one claim and one recorded download per photo, and hands the app the link', async () => {
    const response = await appClick()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ url: 'https://r2.example/zip' })
    expect(mocks.downloadBatchZip).toHaveBeenCalledTimes(1)
    expect(mocks.recordJobDownload.mock.calls.map(([, row]) => row.jobId)).toEqual(['j1', 'j2'])
  })

  it('still redirects a plain GET to the link, recording it once', async () => {
    const response = await route()
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://r2.example/zip')
    expect(mocks.recordJobDownload).toHaveBeenCalledTimes(2)
  })

  it('records nothing while packing or past the limit', async () => {
    mocks.downloadBatchZip.mockResolvedValueOnce({ status: 'packing' }).mockResolvedValueOnce({ status: 'limited' })
    expect((await appClick()).status).toBe(202)
    expect((await appClick()).status).toBe(429)
    expect(mocks.recordJobDownload).not.toHaveBeenCalled()
  })
})
