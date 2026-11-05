import type { Template } from '@/core/templates'

import type { CoverPurpose } from '../covers/cover-rules'

export type AdminTemplate = Template & {
  // null only if a template was created outside the admin flow without a prompt.
  prompt: { body: string; version: number; modelParams: Record<string, unknown> } | null
}

// What the editor sends back; validated again on the server before it reaches the database.
export type SaveTemplatePayload = {
  template: unknown
  prompt: unknown
  isNew: boolean
}

export type ActionFailure = { ok: false; code: string; message: string }
export type ActionResult = { ok: true } | ActionFailure
export type ActionValue<T> = { ok: true; value: T } | ActionFailure

export type CoverUploadRequest = { templateId: string; purpose: CoverPurpose; contentType: string; size: number }
export type CoverTicket = { key: string; putUrl: string; headers: { 'Content-Type': string } }
export type ApplyCoverRequest =
  | { templateId: string; slot: 'before' | 'after'; key: string }
  | { templateId: string; slot: 'motion'; key: string; posterKey?: string }
  | { templateId: string; slot: 'clear-motion' }

export type TemplateAdminActions = {
  save: (payload: SaveTemplatePayload) => Promise<ActionResult>
  setActive: (input: { id: string; active: boolean; reason?: string }) => Promise<ActionResult>
  reorder: (ids: string[]) => Promise<ActionResult>
  requestCoverUpload: (input: CoverUploadRequest) => Promise<ActionValue<CoverTicket>>
  applyCover: (input: ApplyCoverRequest) => Promise<ActionResult>
}
