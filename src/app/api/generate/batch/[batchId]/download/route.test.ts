import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ downloadBatchZip: vi.fn(), recordJobDownload: vi.fn() }))

vi.mock('@/core/auth', () => ({ requireApiUser: async () => ({ id: 'u1' }), createAdminSupabase: () => ({}), clientIp: () => null }))
vi.mock('@/core/jobs', () => ({ downloadBatchZip: mocks.downloadBatchZip, recordJobDownload: mocks.recordJobDownload }))
vi.mock('next/server', async (importOriginal) => ({ ...(await importOriginal<object>()), after: (work: () => unknown) => work() }))

const { GET } = await import('./route')

const BATCH = '33333333-3333-4333-8333-333333333333'
const call = (query = '') =>
  GET(new NextRequest(`http://localhost:3000/api/generate/batch/${BATCH}/download${query}`), { params: Promise.resolve({ batchId: BATCH }) })

describe('GET /api/generate/batch/[batchId]/download ?bg=', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.downloadBatchZip.mockResolvedValue({ status: 'ready', url: 'https://r2.example/zip', files: [{ jobId: 'j1' }, { jobId: 'j2' }] })
  })

  it('packs cut-outs on white unless 透明底 is asked for', async () => {
    await call()
    await call('?bg=transparent')
    await call('?bg=black')
    expect(mocks.downloadBatchZip.mock.calls.map((args) => args[3])).toEqual(['white', 'transparent', 'white'])
  })

  it('still records one download per work in the ZIP', async () => {
    const response = await call('?bg=white')
    expect(response.status).toBe(302)
    expect(mocks.recordJobDownload).toHaveBeenCalledTimes(2)
  })
})
