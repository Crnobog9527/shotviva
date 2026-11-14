import { describe, expect, it, vi } from 'vitest'

import { appVersion } from '../build-env'
import { addHold, getHolds, subscribeHolds } from './holds'
import { versionResponse } from './server'

describe('banner holds (T90)', () => {
  it('is busy while any upload, generation or checkout holds it, each released on its own', () => {
    const listener = vi.fn()
    const stop = subscribeHolds(listener)
    const upload = addHold('upload')
    const checkout = addHold('checkout')
    expect(getHolds()).toEqual({ busy: true, photos: false })
    upload()
    expect(getHolds().busy).toBe(true)
    checkout()
    expect(getHolds()).toEqual({ busy: false, photos: false })
    expect(listener).toHaveBeenCalledTimes(2)
    stop()
  })

  it('photos picked but not generated are not busy, only noted', () => {
    const release = addHold('photos')
    expect(getHolds()).toEqual({ busy: false, photos: true })
    release()
    expect(getHolds()).toEqual({ busy: false, photos: false })
  })
})

describe('build version (T90)', () => {
  it('is the deployment id, else the commit, else dev', () => {
    expect(appVersion({ VERCEL_DEPLOYMENT_ID: 'dpl_abc', VERCEL_GIT_COMMIT_SHA: 'f00' })).toBe('dpl_abc')
    expect(appVersion({ VERCEL_DEPLOYMENT_ID: '', VERCEL_GIT_COMMIT_SHA: 'f00' })).toBe('f00')
    expect(appVersion({})).toBe('dev')
  })

  it('GET /api/version answers the build constant, never cached', async () => {
    const response = versionResponse()
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('vercel-cdn-cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ version: 'dev' })
  })
})
