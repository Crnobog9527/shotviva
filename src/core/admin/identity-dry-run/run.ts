import 'server-only'

import { z } from 'zod'

import { IDENTITY_JUDGE_TIMEOUT_MS, judgeWithin, matchIdentitySwapKeyword, type IdentityJudge } from '@/core/identity-guard'
import { modelFromTag } from '@/core/jobs/provider-tag'

import { DRY_RUN_MAX_CHARS, DRY_RUN_MAX_LINES, type DryRunResult, type DryRunRow } from './types'

// The admin dry run (T81): each line through the keyword list and the active decision model, the
// same question production asks, with the latency and tokens of each call. Nothing is generated,
// charged, recorded or counted against any account's hourly calls; the admin pays only the model.

const inputSchema = z.object({ text: z.string().max(DRY_RUN_MAX_LINES * (DRY_RUN_MAX_CHARS + 2)) })

// Four at a time: 50 lines finish in seconds, and each latency is still one request's.
const CONCURRENCY = 4

type Refused = Exclude<DryRunResult, { ok: true }>

function linesOf(raw: string): string[] | Refused {
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  if (lines.length === 0) return { ok: false, reason: 'empty' }
  if (lines.length > DRY_RUN_MAX_LINES) return { ok: false, reason: 'too_many_lines' }
  if (lines.some((line) => Array.from(line).length > DRY_RUN_MAX_CHARS)) return { ok: false, reason: 'line_too_long' }
  return lines
}

const reasonOf = (error: unknown) => (error instanceof Error ? error.message.slice(0, 80) : 'failed')

async function runLine(judge: IdentityJudge | null, text: string): Promise<DryRunRow> {
  const keyword = matchIdentitySwapKeyword(text)
  const row: DryRunRow = { text, keyword, identitySwap: null, refused: keyword !== null, ms: null, inputTokens: null, outputTokens: null, error: null }
  if (!judge) return { ...row, error: 'no decision provider is on' }
  const started = performance.now()
  try {
    const answer = await judgeWithin(judge, text, IDENTITY_JUDGE_TIMEOUT_MS)
    const ms = Math.round(performance.now() - started)
    const usage = { inputTokens: answer.usage?.inputTokens ?? null, outputTokens: answer.usage?.outputTokens ?? null }
    return { ...row, ...usage, identitySwap: answer.identitySwap, refused: row.refused || answer.identitySwap, ms }
  } catch (error) {
    return { ...row, ms: Math.round(performance.now() - started), error: reasonOf(error) }
  }
}

async function inBatches(judge: IdentityJudge | null, lines: string[]): Promise<DryRunRow[]> {
  const rows: DryRunRow[] = []
  for (let i = 0; i < lines.length; i += CONCURRENCY) {
    rows.push(...(await Promise.all(lines.slice(i, i + CONCURRENCY).map((line) => runLine(judge, line)))))
  }
  return rows
}

export async function dryRunIdentityScreen(judge: IdentityJudge | null, input: unknown, now: () => Date = () => new Date()): Promise<DryRunResult> {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, reason: 'too_many_lines' }
  const lines = linesOf(parsed.data.text)
  if (!Array.isArray(lines)) return lines
  const rows = await inBatches(judge, lines)
  return { ok: true, model: judge ? modelFromTag(judge.tag) : null, prices: judge?.prices ?? null, ranAt: now().toISOString(), rows }
}
