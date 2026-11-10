import type { Resolution } from '@/core/templates/output-options'
import type { TemplateQuality } from '@/core/templates/pricing'

export type LabVersion = { id: string; version_no: number; note: string | null }
export type LabRun = {
  id: string; batch_id: string; photo_id: string; version_id: string; model: string
  resolution: Resolution; quality: TemplateQuality; status: 'queued' | 'running' | 'succeeded' | 'failed'
  estimate_usd: number; cost_usd: number | null; error_code: string | null; started_at: string
  starred: boolean; is_best: boolean; use_style_reference: boolean
  prompt_lab_versions: { version_no: number }
}
export type LabPage<T> = { items: T[]; next: string | null }
export type LabState = { versions: LabPage<LabVersion>; runs: LabPage<LabRun> }
export type LabModels = {
  image: { id: string; label: string; resolutions: Resolution[]; fixedQuality: boolean }[]
  vision: { id: string; label: string }[]
}
export type ReverseSettings = { model: string; instruction: string }
