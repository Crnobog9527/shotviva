import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { z } from 'zod'

// Whether production has a template's latest test-site state, for `templates:status`. The sync's
// own ledger (template_sync_history) is on production, which these tools never read, so this reads
// the "Sync preview templates to production" workflow's successful runs on GitHub instead (read
// only): their titles name the template ids and series slugs synced, and a run after the
// template's last change on the test site means production has it.

export type SyncRun = { title: string; at: string }
export type SyncState = '未同步' | '已同步' | '测试站更新了' | '无法确认'

const runSchema = z.array(z.object({ displayTitle: z.string(), createdAt: z.string() }))

export async function readSyncRuns(): Promise<SyncRun[] | null> {
  try {
    const { stdout } = await promisify(execFile)('gh', ['run', 'list', '--workflow', 'template-sync.yml', '--status', 'success',
      '--limit', '300', '--json', 'displayTitle,createdAt'], { timeout: 20_000 })
    return runSchema.parse(JSON.parse(stdout)).map(run => ({ title: run.displayTitle, at: run.createdAt }))
  } catch {
    return null
  }
}

// "Sync templates a, b series s1 s2" (older runs have no series part).
function named(title: string, id: string, seriesSlug: string | null) {
  const match = /^Sync templates (.*?)(?: series (.*))?$/.exec(title)
  if (!match) return false
  const ids = match[1].split(/[\s,]+/).filter(Boolean)
  const slugs = (match[2] ?? '').split(/[\s,]+/).filter(Boolean)
  return ids.includes(id) || (seriesSlug !== null && slugs.includes(seriesSlug))
}

export function syncState(id: string, seriesSlug: string | null, changedAt: string | null, runs: SyncRun[] | null): SyncState {
  if (runs === null) return '无法确认'
  const last = runs.filter(run => named(run.title, id, seriesSlug)).map(run => run.at).sort().at(-1)
  if (!last) return '未同步'
  return changedAt && changedAt > last ? '测试站更新了' : '已同步'
}
