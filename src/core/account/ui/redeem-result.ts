import { z } from 'zod'

const success = z.object({
  status: z.literal('ok'),
  credits: z.number().int().nonnegative(),
  pool: z.enum(['free', 'paid']).nullable(),
  percent: z.number().nullable(),
})
const issue = z.object({ code: z.string(), currentCode: z.string().optional() })

const messages: Record<string, string> = {
  CODE_NOT_FOUND: 'notFound', CODE_EXPIRED: 'expired', CODE_FULL: 'full', CODE_USED: 'used',
  CODE_NEW_USERS_ONLY: 'newOnly', CODE_OWN: 'own', CODE_ALREADY_INVITED: 'invited',
  CODE_CHECKOUT_IN_PROGRESS: 'checkout', CODE_INVITE_INELIGIBLE: 'ineligible',
  FORBIDDEN: 'forbidden', RATE_LIMITED: 'rate', UNAUTHORIZED: 'auth', INVALID_INPUT: 'invalid',
}
export type RedeemResult = { kind: 'ok'; value: z.infer<typeof success> }
  | { kind: 'confirm'; old: string | null }
  | { kind: 'error'; key: string }

export function redeemResult(ok: boolean, body: unknown): RedeemResult {
  if (ok) {
    const parsed = success.safeParse(body)
    return parsed.success ? { kind: 'ok', value: parsed.data } : { kind: 'error', key: 'unknown' }
  }
  const parsed = issue.safeParse(body)
  if (!parsed.success) return { kind: 'error', key: 'unknown' }
  if (parsed.data.code === 'CODE_NEEDS_CONFIRM') return { kind: 'confirm', old: parsed.data.currentCode ?? null }
  return { kind: 'error', key: messages[parsed.data.code] ?? 'unknown' }
}
