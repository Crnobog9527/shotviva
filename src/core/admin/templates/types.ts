import type { StyleRef } from '@/core/templates/style-refs'
import type { Template } from '@/core/templates'

import type { CoverPurpose } from '../covers/cover-rules'
import type { BulkEditOutcome, BulkEditPatch } from './bulk-edit-rules'
import type { ActiveChangeOutcome } from './publish-rules'

export type AdminTemplate = Template & {
  saleEnabled?: boolean
  // null only if a template was created outside the admin flow without a prompt.
  prompt: { styleRefs: StyleRef[]; providerId: string | null; body: string; version: number; modelParams: Record<string, unknown> } | null
}

// What the editor sends back; validated again on the server before it reaches the database.
export type SaveTemplatePayload = {
  template: unknown
  prompt: unknown
  isNew: boolean
  revision?: { expected: number; selected?: number }
}

export type ActionFailure = { ok: false; code: string; message: string }
export type ActionResult = { ok: true; version?: number } | ActionFailure
export type ActionValue<T> = { ok: true; value: T } | ActionFailure

// The two lists /admin/templates orders (T76): the whole catalogue and the home featured list.
export type TemplateOrderGroup = 'catalogue' | 'featured'

export type CoverUploadRequest = { templateId: string; purpose: CoverPurpose; contentType: string; size: number }
export type CoverTicket = { key: string; putUrl: string; headers: { 'Content-Type': string } }
// locale: null / absent = the common cover; a code = that language's own (ARCHITECTURE §8.3, T87).
export type ApplyCoverRequest =
  | { templateId: string; locale?: string | null; slot: 'before' | 'after'; key: string }
  | { templateId: string; locale?: string | null; slot: 'motion'; key: string; posterKey?: string }
  | { templateId: string; locale?: string | null; slot: 'clear-motion' }
  | { templateId: string; locale: string; slot: 'clear-locale' }

// A tab of the cover area (T87): the common cover (code null), each launched language, then the
// languages registered as upcoming in site.config (prepared ahead, never shown on the site yet).
export type CoverLanguage = { code: string | null; label: string; upcoming: boolean }

export type CopyReceipt = { id: string; previousStandard: number | null }
export type PromptSnapshot = NonNullable<AdminTemplate['prompt']> & { providerModel: string | null }
export type TemplateAdminActions = {
  setSale: (input: { id: string; enabled: boolean }) => Promise<ActionResult>
  versions: (input: { id: string; before?: number }) => Promise<ActionValue<number[]>>
  snapshot: (input: { id: string; version: number }) => Promise<ActionValue<PromptSnapshot>>
  duplicate: (input: { source: string; requestId: string }) => Promise<ActionValue<CopyReceipt>>
  save: (payload: SaveTemplatePayload) => Promise<ActionResult>
  setActive: (input: { id: string; active: boolean; reason?: string }) => Promise<ActionResult>
  // The bulk bar (T60): one call for the batch, partial success reported per template.
  setActiveMany: (input: { ids: string[]; active: boolean; reason?: string }) => Promise<ActionValue<ActiveChangeOutcome>>
  // Batch edit (T79): prices, entry points and quality of the ticked templates, all or nothing.
  editMany: (input: { ids: string[]; patch: BulkEditPatch }) => Promise<ActionValue<BulkEditOutcome>>
  // Drag-to-reorder and the arrows (T76): one group's whole new order.
  setOrder: (input: { group: TemplateOrderGroup; ids: string[] }) => Promise<ActionResult>
  // The home featured list in display order (T53).
  setFeatured: (ids: string[]) => Promise<ActionResult>
  requestCoverUpload: (input: CoverUploadRequest) => Promise<ActionValue<CoverTicket>>
  applyCover: (input: ApplyCoverRequest) => Promise<ActionResult>
}
