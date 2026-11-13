import type { CreditsCost, TemplateQuality } from '@/core/templates/pricing'
import type { Resolution } from '@/core/templates/output-options'
import type { StyleRef } from '@/core/templates/style-refs'

// Provider profiles (Owner 2026-11-13, migrations 1390–1394): every template keeps its ChatGPT
// setup and can carry a Seedream setup; one of them is live.
export const PROFILES = ['openai', 'seedream'] as const
export type ProfileKey = (typeof PROFILES)[number]

export type ProfileSummary = {
  profile: ProfileKey
  version: number
  quality: TemplateQuality
  creditsCost: CreditsCost
  unpricedResolutions: Resolution[]
  // Production only: the test site's model has no row here yet (switching is refused).
  providerUnmatched: { adapter: string; model: string; base_url: string } | null
  updatedAt: string
  providerId: string | null
}

export type ProfileTemplate = {
  id: string
  name: string
  nameZh: string | null
  category: string
  seriesId: string | null
  isActive: boolean
  slots: number
  active: ProfileKey
  liveProviderId: string | null
  profiles: Partial<Record<ProfileKey, ProfileSummary>>
}

export type ProfileDetail = ProfileSummary & {
  body: string
  modelParams: Record<string, unknown>
  styleRefs: StyleRef[]
  providerId: string | null
  providerModel: string | null
}

export type ImageModel = { id: string; label: string; model: string; adapter: string; isActive: boolean }

export type SaveProfileInput = {
  id: string
  profile: ProfileKey
  expected: number | null
  providerId: string | null
  body: string
  modelParams: Record<string, unknown>
  styleRefs: StyleRef[]
  quality: TemplateQuality
  creditsCost: CreditsCost
  unpricedResolutions: Resolution[]
}

export type SwitchScope = { kind: 'site' } | { kind: 'category'; key: string } | { kind: 'series'; key: string } | { kind: 'ids'; ids: string[] }
export type SwitchInput = { scope: SwitchScope; target: ProfileKey; reason: string; validateOnly: boolean }

export type SwitchSide = { resolutions: Resolution[]; credits: CreditsCost }
export type SwitchRow =
  | { id: string; ok: true; unchanged?: boolean; from: ProfileKey; to: ProfileKey; before: SwitchSide; after: SwitchSide }
  | { id: string; ok: false; code: string; detail: string | null }

export type DriftRow = { templateId: string; profile: ProfileKey; problem: string }
