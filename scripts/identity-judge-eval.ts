/**
 * Runs the T81 example sentences (src/core/identity-guard/examples.test-data.ts) through the
 * keyword list and the real decision model, and prints the results table, latency and tokens
 * for the PR (ARCHITECTURE §5.1a).
 *
 *   OPENAI_API_KEY=… pnpm eval:identity              # gpt-6-luna on api.openai.com
 *   IDENTITY_MODEL=… OPENAI_BASE_URL=… pnpm eval:identity
 *
 * The key is read from the environment only and never printed. Each sentence is one billed call
 * (about 450 input and 6 output tokens on gpt-6-luna, well under a cent for the whole set).
 */
import { z } from 'zod'

import { ALLOW_EXAMPLES, REFUSE_EXAMPLES, type IdentityExample } from '../src/core/identity-guard/examples.test-data'
import { matchIdentitySwapKeyword } from '../src/core/identity-guard/keywords'
import { IDENTITY_EDIT_ADDENDUM, IDENTITY_JUDGE_INSTRUCTIONS } from '../src/core/identity-guard/question'
import { MODEL_PRICES } from '../src/core/jobs/model-prices'
import { createOpenAIIdentityJudge } from '../src/modules/image/edit/openai-identity-judge'

const env = z
  .object({
    OPENAI_API_KEY: z.string().min(1),
    IDENTITY_MODEL: z.string().default('gpt-6-luna'),
    OPENAI_BASE_URL: z.url().default('https://api.openai.com/v1'),
  })
  .parse(process.env)

const judge = createOpenAIIdentityJudge({ apiKey: env.OPENAI_API_KEY, model: env.IDENTITY_MODEL, baseUrl: env.OPENAI_BASE_URL }, `eval/${env.IDENTITY_MODEL}`)

type Row = IdentityExample & { kw: boolean; model: boolean | 'error'; ms: number; inTok: number; outTok: number }

async function ask(text: string, instructions = IDENTITY_JUDGE_INSTRUCTIONS) {
  const started = performance.now()
  const answer = await judge.judge({ text, instructions, signal: AbortSignal.timeout(10_000) })
  return { ...answer, ms: Math.round(performance.now() - started) }
}

async function run(example: IdentityExample): Promise<Row> {
  const kw = matchIdentitySwapKeyword(example.text) !== null
  try {
    const answer = await ask(example.text)
    return { ...example, kw, model: answer.identitySwap, ms: answer.ms, inTok: answer.usage?.inputTokens ?? 0, outTok: answer.usage?.outputTokens ?? 0 }
  } catch {
    return { ...example, kw, model: 'error', ms: 0, inTok: 0, outTok: 0 }
  }
}

const pct = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor((values.length * p) / 100))] ?? 0
const cell = (value: string) => value.replace(/\|/g, '\\|')

function verdict(row: Row) {
  const refused = row.kw || row.model === true
  return (refused ? 'refuse' : 'allow') === row.expect ? '✅' : '❌'
}

async function main() {
  const rows: Row[] = []
  // One at a time, so the latencies are those of a single request.
  for (const example of [...REFUSE_EXAMPLES, ...ALLOW_EXAMPLES]) rows.push(await run(example))

  console.log('| # | Sentence | Lang | Expected | Keyword | Model | Final | ms |')
  console.log('|---|---|---|---|---|---|---|---|')
  rows.forEach((row, i) => {
    const model = row.model === 'error' ? 'error' : row.model ? 'refuse' : 'allow'
    console.log(`| ${i + 1} | ${cell(row.text)} | ${row.lang} | ${row.expect} | ${row.kw ? 'refuse' : '—'} | ${model} | ${verdict(row)} | ${row.ms} |`)
  })

  const answered = rows.filter((row) => row.model !== 'error')
  const ms = answered.map((row) => row.ms)
  const avg = (values: number[]) => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length)
  const inTok = avg(answered.map((row) => row.inTok))
  const outTok = avg(answered.map((row) => row.outTok))
  const prices = MODEL_PRICES[env.IDENTITY_MODEL]?.prices
  const cost = prices ? (inTok * (prices.inputTextPerM ?? 0) + outTok * (prices.outputPerM ?? 0)) / 1_000_000 : null

  // What merging into the edit scope call adds: the addendum's tokens, measured as the difference
  // between the same short text asked with the addendum and with one word of instructions.
  const bare = await ask('x', 'Answer JSON.')
  const withAddendum = await ask('x', `Answer JSON.\n\n${IDENTITY_EDIT_ADDENDUM}`)
  const addendumTok = (withAddendum.usage?.inputTokens ?? 0) - (bare.usage?.inputTokens ?? 0)

  console.log('')
  console.log(`Correct: ${rows.filter((row) => verdict(row) === '✅').length}/${rows.length}; model errors: ${rows.length - answered.length}`)
  console.log(`Text-only call (${env.IDENTITY_MODEL}): p50 ${pct(ms, 50)} ms, p95 ${pct(ms, 95)} ms, max ${Math.max(...ms)} ms`)
  console.log(`Tokens per call: ${inTok.toFixed(0)} in, ${outTok.toFixed(1)} out; cost per call: ${cost === null ? 'unknown model price' : `$${cost.toFixed(7)}`}`)
  console.log(`Photo edit (merged into the scope call): +${addendumTok} input tokens, +~6 output tokens, no extra request`)
}

void main()
