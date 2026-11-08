import type { ProviderPrices } from '@/core/jobs/provider'

// The admin dry run of the face-swap screen (ARCHITECTURE §5.1a, T81): what it answers, as plain
// data a server action hands the browser.

export const DRY_RUN_MAX_LINES = 50
export const DRY_RUN_MAX_CHARS = 300

export type DryRunRow = {
  text: string
  // The decision model's answer, which is the production verdict; null when it failed or no
  // decision provider is on (production then lets the request through).
  identitySwap: boolean | null
  ms: number | null
  inputTokens: number | null
  outputTokens: number | null
  // The failure as a short reason (status code, timeout, parse), never the words.
  error: string | null
}

export type DryRunResult =
  | { ok: true; model: string | null; promptVersion: string; prices: ProviderPrices | null; ranAt: string; rows: DryRunRow[] }
  | { ok: false; reason: 'too_many_lines' | 'line_too_long' | 'empty' }
