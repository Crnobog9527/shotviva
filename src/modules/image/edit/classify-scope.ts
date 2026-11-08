import 'server-only'

import { IDENTITY_JUDGE_ATTEMPTS, IDENTITY_JUDGE_TIMEOUT_MS, isRetryable } from '@/core/identity-guard'
import { logger } from '@/core/logger'
import type { EditScope } from '@/core/templates'

import type { ClassifierInput, ClassifierUsage, ScopeClassifier } from './classifier'

// ARCHITECTURE §5.2: the classifier must not hold the edit up. It also answers the face-swap
// question (§5.1a), so it gets the same deadline and retry as the workspace's judge: 5 seconds an
// attempt, a second attempt after a timeout, a 5xx or a dropped connection (an edit already takes
// about a minute). Both attempts failing, another error, or no decision provider switched on all
// mean the fallback paragraph, and the edit goes through unscreened (fail open).
export const CLASSIFIER_TIMEOUT_MS = IDENTITY_JUDGE_TIMEOUT_MS
export const CONFIDENCE_THRESHOLD = 0.5

export type EditClassification = {
  scope: EditScope
  // What the model answered, kept for the Owner tuning the paragraphs; null when it never did.
  confidence: number | null
  keep: string[]
  change: string | null
  // Tokens the step used, for the job's cost (T33); null when nothing was billed or reported.
  usage: ClassifierUsage | null
  // ARCHITECTURE §5.1a: the words ask for a face swap. Taken whatever the confidence; false when
  // the model never answered (the edit is then let through: fail open).
  identitySwap: boolean
}

const FALLBACK: EditClassification = { scope: 'fallback', confidence: null, keep: [], change: null, usage: null, identitySwap: false }

async function withTimeout(classifier: ScopeClassifier, input: Omit<ClassifierInput, 'signal'>, ms: number) {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new Error(`classifier exceeded ${ms}ms`))
    }, ms)
  })
  try {
    return await Promise.race([classifier.classify({ ...input, signal: controller.signal }), deadline])
  } finally {
    clearTimeout(timer)
  }
}

async function withRetry(classifier: ScopeClassifier, input: Omit<ClassifierInput, 'signal'>, ms: number) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await withTimeout(classifier, input, ms)
    } catch (error) {
      if (attempt >= IDENTITY_JUDGE_ATTEMPTS || !isRetryable(error)) throw error
    }
  }
}

export async function classifyEditScope(
  classifier: ScopeClassifier | null,
  input: Omit<ClassifierInput, 'signal'>,
  timeoutMs: number = CLASSIFIER_TIMEOUT_MS,
): Promise<EditClassification> {
  if (!classifier) return FALLBACK
  try {
    const answer = await withRetry(classifier, input, timeoutMs)
    const confidence = Math.round(answer.confidence * 10_000) / 10_000
    const scope = confidence >= CONFIDENCE_THRESHOLD ? answer.scope : 'fallback'
    return { scope, confidence, keep: answer.keep, change: answer.change, usage: answer.usage, identitySwap: answer.identitySwap }
  } catch (error) {
    // The error carries a status, a timeout or a parse failure, never the user's words.
    logger.warn('edit classifier failed; using fallback', { provider: classifier.tag, error })
    return FALLBACK
  }
}
