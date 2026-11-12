import { describe, expect, it, vi } from 'vitest'

import { screenWork, type ScreenRow } from './moderate-work'

// The automatic screen's hand-off to the gallery (ARCHITECTURE §9 第 5、9 条): an approved work's
// hook runs (cache + gallery copies) before the screen counts as done; nothing else calls it.

const row: ScreenRow = { id: 'job-1', output_key: 'outputs/u/job-1.png', parent_job_id: null, inputs: {} }

function deps(status: string | null) {
  const rpc = vi.fn(async (fn: string) => ({ data: fn === 'record_work_auto_moderation' ? status : 1, error: null }))
  const order: string[] = []
  const onApproved = vi.fn(async (jobId: string) => {
    await Promise.resolve()
    order.push(`approved:${jobId}`)
  })
  return {
    deps: {
      db: { rpc },
      store: { presignGet: async (key: string) => `https://signed.test/${key}` },
      screen: async () => ({ flagged: false, categories: [] }),
      onApproved,
    },
    rpc,
    onApproved,
    order,
  }
}

describe('screenWork', () => {
  it('waits for the approval hook with the work id', async () => {
    const d = deps('approved')
    expect(await screenWork(d.deps, row)).toBe('approved')
    expect(d.order).toEqual(['approved:job-1'])
  })

  it('does not call it for a work left pending or rejected, or a failed screen', async () => {
    for (const status of ['pending', 'rejected', null]) {
      const d = deps(status)
      await screenWork(d.deps, row)
      expect(d.onApproved).not.toHaveBeenCalled()
    }
    const d = deps('approved')
    expect(await screenWork({ ...d.deps, screen: async () => Promise.reject(new Error('down')) }, row)).toBe('skipped')
    expect(d.onApproved).not.toHaveBeenCalled()
    expect(d.rpc).toHaveBeenCalledWith('record_work_screen_failure', { p_job_id: 'job-1' })
  })
})
