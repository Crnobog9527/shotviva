import type { Template } from '@/core/templates'

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

export type ActionResult = { ok: true } | { ok: false; code: string; message: string }

export type TemplateAdminActions = {
  save: (payload: SaveTemplatePayload) => Promise<ActionResult>
  setActive: (input: { id: string; active: boolean; reason?: string }) => Promise<ActionResult>
  reorder: (ids: string[]) => Promise<ActionResult>
}
