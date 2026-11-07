import type { ProviderPrices } from '@/core/jobs/provider'

import type { DryRunRow } from '../identity-dry-run/types'

// Numbers under the dry-run table: latency percentiles, mean tokens and the cost of one call at
// the decision row's prices. Pure, so it is tested without a browser.

export type DryRunSummary = { answered: number; refused: number; p50: number; p95: number; inputTokens: number; outputTokens: number; costUsd: number | null }

const percentile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100))] ?? 0

const mean = (values: number[]) => (values.length === 0 ? 0 : Math.round(values.reduce((a, b) => a + b, 0) / values.length))

function costOf(prices: ProviderPrices | null, inputTokens: number, outputTokens: number): number | null {
  if (!prices || prices.inputTextPerM === null || prices.outputPerM === null) return null
  return (inputTokens * prices.inputTextPerM + outputTokens * prices.outputPerM) / 1_000_000
}

export function summarize(rows: DryRunRow[], prices: ProviderPrices | null): DryRunSummary {
  const answered = rows.filter((row) => row.identitySwap !== null)
  const ms = answered.map((row) => row.ms ?? 0).sort((a, b) => a - b)
  const inputTokens = mean(answered.map((row) => row.inputTokens ?? 0))
  const outputTokens = mean(answered.map((row) => row.outputTokens ?? 0))
  return {
    answered: answered.length,
    refused: rows.filter((row) => row.refused).length,
    p50: percentile(ms, 50),
    p95: percentile(ms, 95),
    inputTokens,
    outputTokens,
    costUsd: costOf(prices, inputTokens, outputTokens),
  }
}
