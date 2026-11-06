import { beijingLocalToIso, toBeijingLocal } from '../shell/format'
import type { FeatureSetting } from '../features/types'

// One feature's form: the three choices and the Beijing-time datetime-local value.
export type Audience = 'all' | 'pro' | 'max'
export type FeatureForm = { audience: Audience; openAt: string }

export const AUDIENCES: readonly Audience[] = ['all', 'pro', 'max']

export function toForm(setting: FeatureSetting): FeatureForm {
  return {
    audience: setting.minTier ?? 'all',
    openAt: setting.minTier && setting.openToAllAt ? toBeijingLocal(setting.openToAllAt) : '',
  }
}

// What the server action receives; the server validates it again.
export function toInput(key: string, form: FeatureForm) {
  const minTier = form.audience === 'all' ? null : form.audience
  return { key, minTier, openToAllAt: minTier ? beijingLocalToIso(form.openAt) : null }
}

export function isDirty(setting: FeatureSetting, form: FeatureForm): boolean {
  const saved = toForm(setting)
  return saved.audience !== form.audience || (form.audience !== 'all' && saved.openAt !== form.openAt)
}
