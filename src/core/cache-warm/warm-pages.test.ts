import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const { schedule } = vi.hoisted(() => ({ schedule: vi.fn() }))
vi.mock('../alerts/schedule', () => ({ schedule }))

import { isWarmableEnvironment, isWarmableOrigin, runWarm, warmPagesSoon, type Fetcher } from './warm-pages'

const ok = () => new Response('<html></html>', { status: 200 })

describe('runWarm', () => {
  it('asks for every page once, one at a time, on the given origin', async () => {
    const seen: string[] = []
    let inFlight = 0
    let maxInFlight = 0
    const fetcher: Fetcher = async (url) => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      seen.push(url)
      await Promise.resolve()
      inFlight--
      return ok()
    }
    await runWarm('https://shotviva.com', ['/', '/zh', '/pricing'], fetcher, 0, { running: false, again: false })
    expect(seen).toEqual(['https://shotviva.com/', 'https://shotviva.com/zh', 'https://shotviva.com/pricing'])
    expect(maxInFlight).toBe(1)
  })

  it('folds saves made during a pass into one more pass', async () => {
    const state = { running: false, again: false }
    let calls = 0
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const fetcher: Fetcher = async () => {
      calls++
      if (calls === 1) await gate
      return ok()
    }
    const first = runWarm('https://shotviva.com', ['/'], fetcher, 0, state)
    await runWarm('https://shotviva.com', ['/'], fetcher, 0, state)
    await runWarm('https://shotviva.com', ['/'], fetcher, 0, state)
    release()
    await first
    expect(calls).toBe(2)
    expect(state.running).toBe(false)
  })

  it('keeps going past a failed page', async () => {
    const seen: string[] = []
    const fetcher: Fetcher = async (url) => {
      seen.push(url)
      if (url.endsWith('/zh')) throw new Error('network')
      return ok()
    }
    await runWarm('https://shotviva.com', ['/', '/zh', '/pricing'], fetcher, 0, { running: false, again: false })
    expect(seen).toHaveLength(3)
  })
})

describe('isWarmableOrigin', () => {
  it('warms deployed sites only, never a local server', () => {
    expect(isWarmableOrigin('https://shotviva.com')).toBe(true)
    expect(isWarmableOrigin('http://localhost:3000')).toBe(false)
  })
})

describe('warmPagesSoon', () => {
  it('warms after a save in production only, never on the test site or locally', () => {
    expect(isWarmableEnvironment('production')).toBe(true)
    for (const env of ['preview', 'development', undefined]) expect(isWarmableEnvironment(env)).toBe(false)
    schedule.mockClear()
    warmPagesSoon(['/'], 'https://shotviva-qa-user.vercel.app', 'preview')
    expect(schedule).not.toHaveBeenCalled()
    warmPagesSoon(['/'], 'https://shotviva.com', 'production')
    expect(schedule).toHaveBeenCalledTimes(1)
  })
})
