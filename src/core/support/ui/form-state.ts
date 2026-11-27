// What a ticket form's server action hands back. Creating returns the new ticket's id (the
// dialog opens it); both return sentAt so the field can start empty. Codes match
// app.support.*.errors.
// TICKET_CLOSED: the Owner closed the ticket after it was opened here (adding only).
// ORG_POOL_REFUND: a refund request for an org-pool purchase (2033), which has no self-service refund.
export type FormError = 'RATE_LIMITED' | 'INVALID_INPUT' | 'NOT_FOUND' | 'IMAGE_TOO_LARGE' | 'IMAGE_UNSUPPORTED' | 'TICKET_CLOSED' | 'ORG_POOL_REFUND' | 'generic'
export type FormState = { error: FormError | null; sentAt?: number; ticketId?: string }

export const IDLE: FormState = { error: null }

const KNOWN: readonly string[] = ['RATE_LIMITED', 'INVALID_INPUT', 'NOT_FOUND', 'IMAGE_TOO_LARGE', 'IMAGE_UNSUPPORTED', 'TICKET_CLOSED', 'ORG_POOL_REFUND']

export function formError(code: string): FormError {
  return KNOWN.includes(code) ? (code as FormError) : 'generic'
}

export type FormAction = (state: FormState, data: FormData) => Promise<FormState>

// One choice of a picker, already worded on the server (product names, money, dates).
// ref: a work's reference number (T78), worded on the server like the label.
// noRefund: a payment that has no self-service refund (its credits went to an org pool, 2033):
// the refund picker leaves it out; billing tickets still offer it.
export type Choice = { value: string; label: string; ref?: string; noRefund?: boolean }
