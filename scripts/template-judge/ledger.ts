import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { z } from 'zod'

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

// The verdict per trial run that the review page and templates:status show: the one the last judge
// run used (a re-used earlier verdict counts), else the newest.
export function latestByRun(ledger: JudgeLedger): Map<string, Verdict> {
  const latest = new Map<string, Verdict>()
  for (const verdict of Object.values(ledger.verdicts)) {
    const seen = latest.get(verdict.runId)
    if (!seen || seen.at < verdict.at) latest.set(verdict.runId, verdict)
  }
  for (const [runId, hash] of Object.entries(ledger.current ?? {})) {
    const verdict = ledger.verdicts[hash]
    if (verdict) latest.set(runId, verdict)
  }
  return latest
}

// "✓3 ✗1 未判 2" for a template's current results.
export function judgeSummary(runIds: string[], latest: Map<string, Verdict>): string {
  let passed = 0
  let failed = 0
  for (const id of runIds) {
    const verdict = latest.get(id)
    if (verdict?.pass) passed++
    else if (verdict) failed++
  }
  const open = runIds.length - passed - failed
  return runIds.length === 0 ? '无结果' : `✓${passed} ✗${failed}${open ? ` 未判 ${open}` : ''}`
}
