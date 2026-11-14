import { describe, expect, it } from 'vitest'

import { batchTally, trayPhoto } from './batch-tally'

const job = (status: 'queued' | 'running' | 'succeeded' | 'failed', credits = 2) => ({ status, credits })

describe('batchTally', () => {
  it('counts each photo on its own and develops the first one in flight', () => {
    const tally = batchTally([job('succeeded'), job('succeeded', 4), job('failed'), job('running'), job('running'), job('queued')])
    expect(tally).toEqual({ count: 6, done: 2, developing: 2, queued: 1, failed: 1, creditsUsed: 6, current: 4, settled: false })
  })

  it('is settled once nothing is running or queued; refunded photos cost nothing', () => {
    expect(batchTally([job('succeeded'), job('failed')])).toMatchObject({ settled: true, current: null, creditsUsed: 2 })
  })

  it('is not settled while photos only wait for a slot', () => {
    expect(batchTally([job('queued'), job('queued')])).toMatchObject({ settled: false, current: null, queued: 2 })
  })
})

describe('trayPhoto', () => {
  const photo = (status: 'queued' | 'running' | 'succeeded' | 'failed', name: string) => ({ status, previewUrl: `blob:${name}`, fileUrl: status === 'succeeded' ? `/file/${name}` : null })
  const jobs = [photo('succeeded', 'a'), photo('running', 'b'), photo('queued', 'c')]
  it('develops the photo in flight, then shows the first saved result', () => {
    expect(trayPhoto(jobs, { current: 2 })).toBe('blob:b')
    expect(trayPhoto(jobs, { current: null })).toBe('/file/a')
    expect(trayPhoto([photo('failed', 'x')], { current: null })).toBe('blob:x')
    expect(trayPhoto([], { current: null })).toBeNull()
  })
})
