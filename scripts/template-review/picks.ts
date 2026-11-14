import type { ObjectStore } from '../../src/core/storage'
import type { Batch } from '../template-apply/schema'
import type { FinalizeProblem, Progress } from './stages'

// The picked result must still be in the bucket (the panel's 30-day cleanup may have removed it),
// or the cover would point at nothing. Checked before anything is written.
export async function missingPicks(batch: Batch, progress: Map<string, Progress>, ids: string[], store: Pick<ObjectStore, 'head'>) {
  const missing: FinalizeProblem[] = []
  for (const id of ids) {
    const pick = batch.templates.find(t => t.id === id)?.review?.pick
    const run = progress.get(id)?.runs.find(r => r.id === pick)
    if (!run?.outputKey || !(await store.head(run.outputKey))) {
      missing.push({ templateId: id, problem: `选中的试跑 ${pick} 的结果图已不在桶里（可能已被 30 天清理），请重新试跑并更新 pick` })
    }
  }
  return missing
}
