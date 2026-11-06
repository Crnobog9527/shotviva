import { describe, expect, it } from 'vitest'

import { isDirty, toForm, toInput } from './form-state'

const setting = { key: 'studio_video', name: '视频工作室', minTier: 'max' as const, openToAllAt: '2026-11-30T16:00:00.000Z' }

describe('feature form', () => {
  it('shows the opening time in Beijing time and sends it back as UTC', () => {
    const form = toForm(setting)
    expect(form).toEqual({ audience: 'max', openAt: '2026-12-01T00:00' })
    expect(toInput('studio_video', form)).toEqual({ key: 'studio_video', minTier: 'max', openToAllAt: '2026-11-30T16:00:00.000Z' })
  })

  it('"所有人" sends no tier and no date', () => {
    expect(toInput('studio_video', { audience: 'all', openAt: '2026-12-01T00:00' })).toEqual({
      key: 'studio_video',
      minTier: null,
      openToAllAt: null,
    })
  })

  it('an empty date means the gate never opens on its own', () => {
    expect(toInput('studio_video', { audience: 'pro', openAt: '' }).openToAllAt).toBeNull()
  })

  it('is dirty only when the saved gate would change', () => {
    expect(isDirty(setting, toForm(setting))).toBe(false)
    expect(isDirty(setting, { audience: 'pro', openAt: '2026-12-01T00:00' })).toBe(true)
    expect(isDirty({ ...setting, minTier: null, openToAllAt: null }, { audience: 'all', openAt: 'x' })).toBe(false)
  })
})
