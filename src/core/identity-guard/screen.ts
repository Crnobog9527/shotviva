import 'server-only'

import type { Locale } from '../i18n/locales'
import { logger } from '../logger'
import type { IdentityEntry, IdentityJudge, IdentityJudgeUsage } from './judge'
import { matchIdentitySwapKeyword } from './keywords'
import { IDENTITY_JUDGE_INSTRUCTIONS } from './question'
import { refuseIdentitySwap, type RefusalDeps } from './refuse'

// ARCHITECTURE §5.1a for the workspace note, template text fields and the partner prompt: the
// keyword list, then one text-only decision call. Runs before reserve_credits. A judge that
// errors, times out or is not switched on lets the request through and logs it: the keywords
// already caught the obvious requests, and generation must not depend on the decision model.

export const IDENTITY_JUDGE_TIMEOUT_MS = 3_000

export type ScreenDeps = RefusalDeps & { identityJudge?: IdentityJudge | null; identityJudgeTimeoutMs?: number }

export type ScreenInput = { userId: string; entry: IdentityEntry; texts: readonly (string | null | undefined)[]; locale?: Locale }

// What the judge cost, to be billed with the job like the edit decision (T33); null when no
// call was made or it reported nothing.
export type ScreenResult = { usage: IdentityJudgeUsage | null }

// Every piece of text the user typed that reaches the image model, one per line.
export function userText(texts: ScreenInput['texts']): string {
  return texts
    .map((text) => text?.trim() ?? '')
    .filter((text) => text.length > 0)
    .join('\n')
}

async function judgeWithin(judge: IdentityJudge, text: string, ms: number) {
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

export async function screenIdentityText(deps: ScreenDeps, input: ScreenInput): Promise<ScreenResult> {
  const text = userText(input.texts)
  if (!text) return { usage: null }
  const refusal = { userId: input.userId, entry: input.entry, text, locale: input.locale }
  if (matchIdentitySwapKeyword(text)) return refuseIdentitySwap(deps, { ...refusal, method: 'keyword' })
  const judge = deps.identityJudge
  if (!judge) return { usage: null }
  let answer
  try {
    answer = await judgeWithin(judge, text, deps.identityJudgeTimeoutMs ?? IDENTITY_JUDGE_TIMEOUT_MS)
  } catch (error) {
    // The error carries a status, a timeout or a parse failure, never the user's words.
    logger.warn('identity judge failed; request allowed', { provider: judge.tag, entry: input.entry, error })
    return { usage: null }
  }
  if (answer.identitySwap) return refuseIdentitySwap(deps, { ...refusal, method: 'model' })
  return { usage: answer.usage }
}
