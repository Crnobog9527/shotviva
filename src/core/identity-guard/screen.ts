import 'server-only'

import { AppError } from '../errors'
import type { Locale } from '../i18n/locales'
import { logger } from '../logger'
import type { IdentityEntry, IdentityJudge, IdentityJudgeAnswer, IdentityJudgeUsage } from './judge'
import { keepVerdict, takeJudgeSlot, textHash } from './judge-slots'
import { matchAnyField } from './keywords'
import { IDENTITY_JUDGE_INSTRUCTIONS } from './question'
import { refuseIdentitySwap, type RefusalDeps } from './refuse'

// ARCHITECTURE §5.1a for the workspace note, template text fields and the partner prompt: the
// keyword list on each field, then one text-only decision call on all of them. Runs before
// reserve_credits. A judge that errors, times out or is not switched on lets the request through
// and logs it: the keywords already caught the unambiguous requests, and generation must not
// depend on the decision model. Calls are capped per account (judge-slots.ts).

export const IDENTITY_JUDGE_TIMEOUT_MS = 3_000

export type ScreenDeps = RefusalDeps & { identityJudge?: IdentityJudge | null; identityJudgeTimeoutMs?: number }

export type ScreenInput = { userId: string; entry: IdentityEntry; texts: readonly (string | null | undefined)[]; locale?: Locale }

// What the judge cost, to be billed with the job like the edit decision (T33); null when no
// call was made or it reported nothing.
export type ScreenResult = { usage: IdentityJudgeUsage | null }

// The non-empty fields the user typed that reach the image model, each trimmed.
export const userFields = (texts: ScreenInput['texts']): string[] => texts.map((text) => text?.trim() ?? '').filter((text) => text.length > 0)

// All of them, one per line: what the judge reads and the refusal row keeps.
export const userText = (texts: ScreenInput['texts']): string => userFields(texts).join('\n')

export async function judgeWithin(judge: IdentityJudge, text: string, ms: number): Promise<IdentityJudgeAnswer> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new Error(`identity judge exceeded ${ms}ms`))
    }, ms)
  })
  try {
    return await Promise.race([judge.judge({ text, instructions: IDENTITY_JUDGE_INSTRUCTIONS, signal: controller.signal }), deadline])
  } finally {
    clearTimeout(timer)
  }
}

export const tooManyJudgeCalls = () => new AppError('RATE_LIMITED', 'Too many requests checked in the last hour; try again later')

async function ask(deps: ScreenDeps, judge: IdentityJudge, text: string, entry: IdentityEntry): Promise<IdentityJudgeAnswer | null> {
  try {
    return await judgeWithin(judge, text, deps.identityJudgeTimeoutMs ?? IDENTITY_JUDGE_TIMEOUT_MS)
  } catch (error) {
    // The error carries a status, a timeout or a parse failure, never the user's words.
    logger.warn('identity judge failed; request allowed', { provider: judge.tag, entry, error })
    return null
  }
}

export async function screenIdentityText(deps: ScreenDeps, input: ScreenInput): Promise<ScreenResult> {
  const fields = userFields(input.texts)
  if (fields.length === 0) return { usage: null }
  const text = fields.join('\n')
  const refusal = { userId: input.userId, entry: input.entry, text, locale: input.locale }
  if (matchAnyField(fields)) return refuseIdentitySwap(deps, { ...refusal, method: 'keyword' })
  const judge = deps.identityJudge
  if (!judge) return { usage: null }
  const slot = await takeJudgeSlot(deps.db, input.userId, textHash(text))
  if (slot.status === 'limited') throw tooManyJudgeCalls()
  if (slot.status === 'cached') return slot.identitySwap ? refuseIdentitySwap(deps, { ...refusal, method: 'model' }) : { usage: null }
  const answer = await ask(deps, judge, text, input.entry)
  if (!answer) return { usage: null }
  await keepVerdict(deps.db, slot, answer.identitySwap)
  if (answer.identitySwap) return refuseIdentitySwap(deps, { ...refusal, method: 'model', usage: answer.usage })
  return { usage: answer.usage }
}
