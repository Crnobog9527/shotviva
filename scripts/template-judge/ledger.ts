import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { z } from 'zod'

import { digest } from '../template-trial/cells'

// The judge's verdicts and spend on this machine: .local/trials/judge.json, beside the trials'
// state.json. A verdict is keyed by its content hash (the images, the checklist, the judge model
// and the skeleton version), so judging an unchanged result again is free. Every call, failed
// ones too, is a line in `spend`. No prompt text is in here, only the batch file's checklist items.

const itemSchema = z.object({
  id: z.string(), text: z.string(), pass: z.boolean(), reason: z.string(),
  // 'pixels': checked on the image itself (alpha, QR), no model.
  source: z.enum(['model', 'pixels']),
})

export const verdictSchema = z.object({
  hash: z.string(), runId: z.string(), templateId: z.string(), version: z.int(), inputIndex: z.int(), k: z.int(),
  model: z.string().nullable(), pass: z.boolean(), items: z.array(itemSchema), costUsd: z.number().nullable(), at: z.string(),
  // A second look at a failed verdict (--rejudge-failed): the first verdict's hash.
  rejudgeOf: z.string().optional(),
})
export type Verdict = z.infer<typeof verdictSchema>
export type VerdictItem = z.infer<typeof itemSchema>

const spendSchema = z.object({
  at: z.string(), runId: z.string(), hash: z.string(), outcome: z.enum(['judged', 'failed']), code: z.string().optional(),
  estimateUsd: z.number(),
  // The call's priced tokens; null when it failed before usage came back (counted at the estimate).
  costUsd: z.number().nullable(),
})
export type SpendLine = z.infer<typeof spendSchema>

const ledgerSchema = z.object({
  version: z.literal(1), verdicts: z.record(z.string(), verdictSchema), spend: z.array(spendSchema),
  // Run id → the hash of the verdict the last judge run used for it, judged or reused. Absent in
  // files written before it existed: those fall back to the newest verdict.
  current: z.record(z.string(), z.string()).default({}),
})
export type JudgeLedger = z.infer<typeof ledgerSchema>

export const LEDGER_FILE = 'judge.json'

export async function readLedger(root: string): Promise<JudgeLedger> {
  const path = join(root, LEDGER_FILE)
  if (!existsSync(path)) return { version: 1, verdicts: {}, spend: [], current: {} }
  const parsed = ledgerSchema.safeParse(JSON.parse(await readFile(path, 'utf8')))
  if (!parsed.success) throw new Error(`${path} 格式不对：先把它改名备份再重跑（已判过的会重新收费）`)
  return parsed.data
}

// Temporary file and rename, like state.json: an interrupted write never leaves half a file.
export async function writeLedger(root: string, ledger: JudgeLedger) {
  await mkdir(root, { recursive: true })
  const path = join(root, LEDGER_FILE)
  await writeFile(`${path}.tmp`, JSON.stringify(ledger, null, 1))
  await rename(`${path}.tmp`, path)
}

// What one spend line counts: its priced tokens, else the hold it was allowed.
export const lineUsd = (line: SpendLine) => line.costUsd ?? line.estimateUsd

export function spentUsd(ledger: JudgeLedger, runIds?: Set<string>) {
  return ledger.spend.filter(line => !runIds || runIds.has(line.runId)).reduce((sum, line) => sum + lineUsd(line), 0)
}

// Where the second look at a failed verdict is kept: one per first verdict, so it is paid once.
export const rejudgeHash = (hash: string) => digest(['rejudge', hash])

// A first verdict with its second look, when there is one.
export type ShownVerdict = Verdict & { rejudge?: Verdict }

// Batch-mode rule: a failed result is judged once more and counts as failed only if both fail.
export type JudgeOutcome = 'pass' | 'fail' | 'fail-twice' | 'pass-on-rejudge'
export function outcomeOf(verdict: ShownVerdict): JudgeOutcome {
  if (verdict.pass) return 'pass'
  if (!verdict.rejudge) return 'fail'
  return verdict.rejudge.pass ? 'pass-on-rejudge' : 'fail-twice'
}
export const counted = (verdict: ShownVerdict) => outcomeOf(verdict) === 'pass' || outcomeOf(verdict) === 'pass-on-rejudge'

// The verdict per trial run that the review page and templates:status show: the one the last judge
// run used (a re-used earlier verdict counts), else the newest first look; with its second look.
export function latestByRun(ledger: JudgeLedger): Map<string, ShownVerdict> {
  const latest = new Map<string, Verdict>()
  for (const verdict of Object.values(ledger.verdicts)) {
    if (verdict.rejudgeOf) continue
    const seen = latest.get(verdict.runId)
    if (!seen || seen.at < verdict.at) latest.set(verdict.runId, verdict)
  }
  for (const [runId, hash] of Object.entries(ledger.current ?? {})) {
    const verdict = ledger.verdicts[hash]
    if (verdict && !verdict.rejudgeOf) latest.set(runId, verdict)
  }
  const shown = new Map<string, ShownVerdict>()
  for (const [runId, verdict] of latest) {
    const rejudge = ledger.verdicts[rejudgeHash(verdict.hash)]
    shown.set(runId, rejudge ? { ...verdict, rejudge } : verdict)
  }
  return shown
}

// "✓3（复判通过 1） ✗1（两次都不过 1） 未判 2" for a template's current results. A pass on the
// second look counts as a pass.
export function judgeSummary(runIds: string[], latest: Map<string, ShownVerdict>): string {
  const counts: Record<JudgeOutcome, number> = { pass: 0, fail: 0, 'fail-twice': 0, 'pass-on-rejudge': 0 }
  for (const id of runIds) {
    const verdict = latest.get(id)
    if (verdict) counts[outcomeOf(verdict)]++
  }
  const passed = counts.pass + counts['pass-on-rejudge']
  const failed = counts.fail + counts['fail-twice']
  const open = runIds.length - passed - failed
  if (runIds.length === 0) return '无结果'
  return `✓${passed}${counts['pass-on-rejudge'] ? `（复判通过 ${counts['pass-on-rejudge']}）` : ''} ✗${failed}` +
    `${counts['fail-twice'] ? `（两次都不过 ${counts['fail-twice']}）` : ''}${open ? ` 未判 ${open}` : ''}`
}
