// What the 「标记已知晓」 cell shows for a payment (1881). Pure, so the rules are tested on their own.
export type AcknowledgeState = {
  status: 'paid' | 'refunded' | 'partially_refunded' | 'disputed'
  acknowledgement: { at: string; stale: boolean } | null
  openDispute: boolean
}

export type AcknowledgeView =
  | { kind: 'none' }
  | { kind: 'unmarked'; openDispute: boolean }
  | { kind: 'stale'; openDispute: boolean }
  | { kind: 'marked'; at: string; openDispute: boolean }

// A plainly paid payment never counts, so it gets no action. A mark whose status or refunded
// amount has changed since no longer hides the payment: it is offered again as 「标记已知晓」.
export function acknowledgeView({ status, acknowledgement, openDispute }: AcknowledgeState): AcknowledgeView {
  if (status === 'paid') return { kind: 'none' }
  if (!acknowledgement) return { kind: 'unmarked', openDispute }
  if (acknowledgement.stale) return { kind: 'stale', openDispute }
  return { kind: 'marked', at: acknowledgement.at, openDispute }
}
