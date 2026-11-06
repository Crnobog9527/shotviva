// What a ticket form's server action hands back. Creating redirects on success; adding a
// message returns sentAt so the field can start empty. Codes match app.support.*.errors.
export type FormError = 'RATE_LIMITED' | 'INVALID_INPUT' | 'NOT_FOUND' | 'generic'
export type FormState = { error: FormError | null; sentAt?: number }

export const IDLE: FormState = { error: null }

export function formError(code: string): FormError {
  return code === 'RATE_LIMITED' || code === 'INVALID_INPUT' || code === 'NOT_FOUND' ? code : 'generic'
}

export type FormAction = (state: FormState, data: FormData) => Promise<FormState>

// One choice of a picker, already worded on the server (product names, money, dates).
export type Choice = { value: string; label: string }
