import 'server-only'

import { logger } from '@/core/logger'
import { DECIDED_SCOPES, type EditScope } from '@/core/templates'

import type { DecisionInput, ScopeDecider, ScopeProbabilities } from './decision'

// ARCHITECTURE §5.2: the decision must not hold the edit up. Over 3 seconds, an error, or no
// decision provider switched on all mean the fallback paragraph.
export const DECISION_TIMEOUT_MS = 3_000
export const SCOPE_THRESHOLD = 0.5

export type ScopeDecision = {
  scope: EditScope
  // What the model answered, for the Owner tuning the paragraphs; null when it never answered.
  probabilities: ScopeProbabilities | null
}

// The most likely range at 0.5 or above; on a tie, the one asked first. Otherwise 'fallback'.
export function pickScope(probabilities: ScopeProbabilities): EditScope {
  let best: EditScope = 'fallback'
  let bestProbability = SCOPE_THRESHOLD
  for (const scope of DECIDED_SCOPES) {
    const probability = probabilities[scope]
    if (probability === null || probability < bestProbability) continue
    if (best === 'fallback' || probability > bestProbability) {
      best = scope
      bestProbability = probability
    }
  }
  return best
}

const round = (value: number | null) => (value === null ? null : Math.round(value * 10_000) / 10_000)

async function withTimeout(decider: ScopeDecider, input: Omit<DecisionInput, 'signal'>, ms: number): Promise<ScopeProbabilities> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new Error(`decision exceeded ${ms}ms`))
    }, ms)
  })
  try {
    return await Promise.race([decider.decide({ ...input, signal: controller.signal }), deadline])
  } finally {
    clearTimeout(timer)
  }
}

export async function decideScope(
  decider: ScopeDecider | null,
  input: Omit<DecisionInput, 'signal'>,
  timeoutMs: number = DECISION_TIMEOUT_MS,
): Promise<ScopeDecision> {
  if (!decider) return { scope: 'fallback', probabilities: null }
  try {
    const raw = await withTimeout(decider, input, timeoutMs)
    const probabilities = Object.fromEntries(DECIDED_SCOPES.map((scope) => [scope, round(raw[scope])])) as ScopeProbabilities
    return { scope: pickScope(probabilities), probabilities }
  } catch (error) {
    // The error carries a status or a timeout, never the instruction or question texts.
    logger.warn('edit decision failed; using fallback', { provider: decider.tag, error })
    return { scope: 'fallback', probabilities: null }
  }
}
