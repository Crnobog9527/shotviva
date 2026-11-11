import { describe, expect, it, vi } from 'vitest'

import type { AgainContext } from '../../again/again-context'
import { prepareOnce, spendAgain } from './again-cache'

const context = { again: { jobId: 'a' } } as unknown as AgainContext

describe('prepareOnce', () => {
  it('prepares a work once, until a generation spends it', async () => {
    const prepare = vi.fn(async () => context)
    await prepareOnce('w1', prepare)
    await prepareOnce('w1', prepare)
    expect(prepare).toHaveBeenCalledTimes(1)
    spendAgain('w1')
    await prepareOnce('w1', prepare)
    expect(prepare).toHaveBeenCalledTimes(2)
  })

  it('does not keep a failed preparation', async () => {
    const prepare = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(context)
    expect(await prepareOnce('w2', prepare)).toBeNull()
    expect(await prepareOnce('w2', prepare)).toBe(context)
    const failing = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(context)
    await expect(prepareOnce('w3', failing)).rejects.toThrow('down')
    expect(await prepareOnce('w3', failing)).toBe(context)
  })
})
