import type { Template } from '@/core/templates'

import type { CoverPurpose } from '../covers/cover-rules'
import type { ActiveChangeOutcome } from './publish-rules'

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

// The two lists /admin/templates orders (T76): the whole catalogue and the home featured list.
export type TemplateOrderGroup = 'catalogue' | 'featured'

export type CoverUploadRequest = { templateId: string; purpose: CoverPurpose; contentType: string; size: number }
export type CoverTicket = { key: string; putUrl: string; headers: { 'Content-Type': string } }
export type ApplyCoverRequest =
  | { templateId: string; slot: 'before' | 'after'; key: string }
  | { templateId: string; slot: 'motion'; key: string; posterKey?: string }
  | { templateId: string; slot: 'clear-motion' }

export type TemplateAdminActions = {
  save: (payload: SaveTemplatePayload) => Promise<ActionResult>
  setActive: (input: { id: string; active: boolean; reason?: string }) => Promise<ActionResult>
  // The bulk bar (T60): one call for the batch, partial success reported per template.
  setActiveMany: (input: { ids: string[]; active: boolean; reason?: string }) => Promise<ActionValue<ActiveChangeOutcome>>
  // Drag-to-reorder and the arrows (T76): one group's whole new order.
  setOrder: (input: { group: TemplateOrderGroup; ids: string[] }) => Promise<ActionResult>
  // The home featured list in display order (T53).
  setFeatured: (ids: string[]) => Promise<ActionResult>
  requestCoverUpload: (input: CoverUploadRequest) => Promise<ActionValue<CoverTicket>>
  applyCover: (input: ApplyCoverRequest) => Promise<ActionResult>
}
