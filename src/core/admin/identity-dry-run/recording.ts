import type { DryRunResult } from './types'

// A dry run as src/core/identity-guard/examples.recorded.json, so the evidence from the test site
// can be committed and replayed in CI (examples.test.ts). Only lines the model answered.
export function toRecording(result: Extract<DryRunResult, { ok: true }>) {
  const answers = Object.fromEntries(
    result.rows
      .filter((row) => row.identitySwap !== null)
      .map((row) => [row.text, { identitySwap: row.identitySwap, ms: row.ms ?? 0, inputTokens: row.inputTokens, outputTokens: row.outputTokens }]),
  )
  return { model: result.model, recordedAt: result.ranAt, answers }
}
