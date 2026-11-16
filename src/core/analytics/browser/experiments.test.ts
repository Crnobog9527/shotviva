import { describe, expect, it, vi } from 'vitest'

import { captureExperimentExposures, tagExperiments } from './experiments'

function withCookie(value: string) {
  let cookie = `sv_exp=${value}`
  return {
    location: { protocol: 'https:' },
    get cookie() { return cookie },
    set cookie(value: string) { cookie = value.split(';')[0] ?? '' },
  } as Document
}

describe('browser experiment reporting', () => {
  it('tags valid assignments and sends one exposure for a new or reassigned variant', () => {
    const doc = withCookie('1.2.2.n~3.5.4.r~6.7.7.f~8.0.8.n')
    const sdk = { register: vi.fn(), capture: vi.fn().mockReturnValue({ event: 'experiment_exposure' }) }
    tagExperiments(sdk, doc)
    expect(sdk.register).toHaveBeenCalledWith({ exp_1: 2, exp_3: 5 })
    captureExperimentExposures(sdk, doc)
    captureExperimentExposures(sdk, doc)
    expect(sdk.capture.mock.calls).toEqual([
      ['experiment_exposure', { experiment_id: 1, variant_id: 2, first_variant_id: 2, reassigned: false }],
      ['experiment_exposure', { experiment_id: 3, variant_id: 5, first_variant_id: 4, reassigned: true }],
    ])
    expect(doc.cookie).toBe('sv_exp=1.2.2~3.5.4~6.7.7.f~8.0.8.n')
  })

  it('keeps the exposure pending if the SDK did not accept it', () => {
    const doc = withCookie('1.2.2.n')
    captureExperimentExposures({ register: vi.fn(), capture: vi.fn() }, doc)
    expect(doc.cookie).toBe('sv_exp=1.2.2.n')
  })
})
