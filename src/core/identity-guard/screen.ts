import 'server-only'

import { AppError } from '../errors'
import type { Locale } from '../i18n/locales'
import { logger } from '../logger'
import type { IdentityEntry, IdentityJudge, IdentityJudgeAnswer, IdentityJudgeUsage } from './judge'
import { IDENTITY_JUDGE_TIMEOUT_MS, JudgeFailure, judgeWithRetry } from './judge-call'
import { FAIL_OPEN_LOG, keepVerdict, markJudgeFailed, takeJudgeSlot, textHash, type JudgeSlot } from './judge-slots'
import { refuseIdentitySwap, type RefusalDeps } from './refuse'

// ARCHITECTURE §5.1a for the workspace note, template text fields and the partner prompt: one
// text-only decision call on all of them, before reserve_credits. There is no keyword step: the
// model judges the intent in any language (question.ts). A judge that errors, times out or is
// not switched on lets the request through and logs it, so generation never depends on the
// decision model. Calls are capped per account and reuse a recent verdict (judge-slots.ts).

export type ScreenDeps = RefusalDeps & { identityJudge?: IdentityJudge | null; identityJudgeTimeoutMs?: number }

export type ScreenInput = { userId: string; entry: IdentityEntry; texts: readonly (string | null | undefined)[]; locale?: Locale }

// What the judge cost, to be billed with the job like the edit decision (T33); null when no
// call was made or it reported nothing.
export type ScreenResult = { usage: IdentityJudgeUsage | null }

// The non-empty fields the user typed that reach the image model, each trimmed.
export const userFields = (texts: ScreenInput['texts']): string[] => texts.map((text) => text?.trim() ?? '').filter((text) => text.length > 0)

// All of them, one per line: what the judge reads and the refusal row keeps.
export const userText = (texts: ScreenInput['texts']): string => userFields(texts).join('\n')

export const tooManyJudgeCalls = () => new AppError('RATE_LIMITED', 'Too many requests checked in the last hour; try again later')

// A failed call lets the request through (fail open). Each one is logged under one message and
// marked on its slot row, so /admin/providers can count them (0705).
async function ask(deps: ScreenDeps, judge: IdentityJudge, text: string, entry: IdentityEntry, slot: JudgeSlot): Promise<IdentityJudgeAnswer | null> {
  try {
    return (await judgeWithRetry(judge, text, deps.identityJudgeTimeoutMs ?? IDENTITY_JUDGE_TIMEOUT_MS)).answer
  } catch (error) {
    const attempts = error instanceof JudgeFailure ? error.attempts : 1
    // The error carries a status, a timeout or a parse failure, never the user's words.
    logger.warn(FAIL_OPEN_LOG, { provider: judge.tag, entry, attempts, error })
    await markJudgeFailed(deps.db, slot)
    return null
  }
}

export async function screenIdentityText(deps: ScreenDeps, input: ScreenInput): Promise<ScreenResult> {
  const fields = userFields(input.texts)
  if (fields.length === 0) return { usage: null }
  const text = fields.join('\n')
  const refusal = { userId: input.userId, entry: input.entry, text, locale: input.locale }
  const judge = deps.identityJudge
  if (!judge) return { usage: null }
  const slot = await takeJudgeSlot(deps.db, input.userId, textHash(text))
  if (slot.status === 'limited') throw tooManyJudgeCalls()
  if (slot.status === 'cached') return slot.identitySwap ? refuseIdentitySwap(deps, { ...refusal, method: 'model' }) : { usage: null }
  const answer = await ask(deps, judge, text, input.entry, slot)
  if (!answer) return { usage: null }
  await keepVerdict(deps.db, slot, answer.identitySwap)
  if (answer.identitySwap) return refuseIdentitySwap(deps, { ...refusal, method: 'model', usage: answer.usage })
  return { usage: answer.usage }
}
