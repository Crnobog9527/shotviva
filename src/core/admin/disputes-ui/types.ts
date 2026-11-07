import type { ActionValue } from '../templates/types'

// The page's server actions (T82). Each re-checks the admin role on the server.
export type DisputeActions = {
  saveText: (input: { id: string; text: string }) => Promise<ActionValue<{ saved: true }>>
  createUpload: (input: { id: string; contentType: string; size: number }) => Promise<ActionValue<{ key: string; putUrl: string; headers: Record<string, string> }>>
  attach: (input: { id: string; key: string; field: string }) => Promise<ActionValue<{ attached: true }>>
  submit: (input: { id: string }) => Promise<ActionValue<{ submittedAt: string }>>
}
