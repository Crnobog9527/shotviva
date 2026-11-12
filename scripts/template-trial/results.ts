import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, sep } from 'node:path'

import { z } from 'zod'

import type { ObjectStore } from '../../src/core/storage'
import type { CellResult } from './runner'

// Results on this machine: each succeeded run's image under .local/trials/<template>/v<version>/,
// and state.json, which remembers every run this machine has seen (outcome, cost, file) for the
// review page and `templates:status`. Nothing here is uploaded; there are no prompts in it.

export const recordSchema = z.object({
  runId: z.string(), templateId: z.string(), version: z.int(), inputIndex: z.int(), k: z.int(),
  outcome: z.enum(['succeeded', 'failed', 'running', 'skipped']), code: z.string().optional(),
  costUsd: z.number().nullable(), provider: z.string().nullable(), durationMs: z.number().nullable(),
  file: z.string().nullable(), at: z.string(),
})
export type TrialRecord = z.infer<typeof recordSchema>
const stateSchema = z.object({ version: z.literal(1), records: z.record(z.string(), recordSchema) })
export type TrialState = z.infer<typeof stateSchema>

// <the .local folder that holds the batch file>/trials
export function trialsRoot(batchFile: string): string {
  const parts = batchFile.split(sep)
  const at = parts.lastIndexOf('.local')
  if (at < 0) throw new Error('批次文件要放在 .local/ 下')
  return join(parts.slice(0, at + 1).join(sep) || sep, 'trials')
}

export async function readTrialState(root: string): Promise<TrialState> {
  const path = join(root, 'state.json')
  if (!existsSync(path)) return { version: 1, records: {} }
  const parsed = stateSchema.safeParse(JSON.parse(await readFile(path, 'utf8')))
  if (!parsed.success) throw new Error(`${path} 格式不对；删掉它会重建（试跑记录仍在数据库里）`)
  return parsed.data
}

export async function writeTrialState(root: string, state: TrialState) {
  await mkdir(root, { recursive: true })
  await writeFile(join(root, 'state.json'), JSON.stringify(state, null, 1))
}

async function download(store: ObjectStore, root: string, result: CellResult): Promise<string | null> {
  const { run, cell } = result
  if (result.outcome !== 'succeeded' || !run?.outputKey) return null
  const file = join(cell.templateId, `v${cell.version}`, `${run.id}.png`)
  const full = join(root, file)
  if (!existsSync(full)) {
    await mkdir(dirname(full), { recursive: true })
    await writeFile(full, await store.get(run.outputKey))
  }
  return file
}

export async function recordResults(store: ObjectStore, root: string, state: TrialState, results: CellResult[]) {
  for (const result of results) {
    if (!result.run && result.outcome === 'skipped') continue
    const { cell, run } = result
    const runId = run?.id ?? `${cell.templateId}:${cell.hash.slice(0, 12)}:${cell.inputIndex}:${cell.k}`
    state.records[runId] = {
      runId, templateId: cell.templateId, version: cell.version, inputIndex: cell.inputIndex, k: cell.k,
      outcome: result.outcome, code: result.code, costUsd: run?.costUsd ?? null, provider: run?.provider ?? null,
      durationMs: run?.durationMs ?? null, file: await download(store, root, result), at: new Date().toISOString(),
    }
  }
  await writeTrialState(root, state)
}
