import type { Batch, TemplateItem } from '../template-apply/schema'

// Where each template of a batch stands in the pipeline (apply → trial → review → finalize), and
// the finalize batch built from the reviews. Pure: the commands read the database and print.

export type TrialRun = { id: string; templateId: string; promptVersion: number | null; status: string; costUsd: number | null; estimateUsd: number }

export type Progress = {
  exists: boolean
  active: boolean
  version: number | null
  runs: TrialRun[]
}

export type ReviewState = 'none' | 'pass' | 'fail' | 'stale'

// A review is about one prompt version; once the prompt moved on it no longer applies.
export function reviewState(item: TemplateItem, version: number | null): ReviewState {
  if (!item.review) return 'none'
  if (version === null || item.review.version !== version) return 'stale'
  return item.review.status
}

const STAGE: Record<string, string> = {
  missing: '未建（先 templates:apply）', live: '已上架', pass: '通过，待定稿', fail: '不通过，待改提示词',
  untried: '草稿，待试跑', review: '待评审', stale: '评审已过期（提示词改过），待试跑或重新评审',
}

export function stageOf(item: TemplateItem, progress: Progress): string {
  if (!progress.exists) return STAGE.missing
  if (progress.active) return STAGE.live
  const review = reviewState(item, progress.version)
  if (review === 'pass' || review === 'fail') return STAGE[review]
  const current = progress.runs.filter(run => run.promptVersion === progress.version && run.status === 'succeeded')
  if (current.length === 0) return review === 'stale' ? STAGE.stale : STAGE.untried
  return review === 'stale' ? STAGE.stale : STAGE.review
}

export function spentUsd(runs: TrialRun[]) {
  return runs.reduce((sum, run) => sum + (run.costUsd ?? 0), 0)
}

export type FinalizeProblem = { templateId: string; problem: string }

function pickProblem(item: TemplateItem, progress: Progress): string | null {
  const pick = progress.runs.find(run => run.id === item.review?.pick)
  if (!pick) return `选中的试跑 ${item.review?.pick} 不存在或不属于这个模板`
  if (pick.status !== 'succeeded') return `选中的试跑 ${pick.id} 没有成功`
  if (pick.promptVersion !== item.review?.version) return `选中的试跑 ${pick.id} 不是 v${item.review?.version} 的结果`
  return null
}

// Each passed, current review becomes the apply fields that finish the template: the picked trial
// result as its cover (「设为封面」), sale opened and published unless the file says false, and the
// model the file names. Nothing else is re-saved. A problem anywhere stops the whole batch.
export function finalizeBatch(batch: Batch, progress: Map<string, Progress>): { batch: Batch; problems: FinalizeProblem[]; skipped: string[] } {
  const templates: TemplateItem[] = []
  const problems: FinalizeProblem[] = []
  const skipped: string[] = []
  for (const item of batch.templates) {
    const state = progress.get(item.id)
    const review = state ? reviewState(item, state.version) : 'none'
    if (review !== 'pass') { if (item.review) skipped.push(`${item.id}：${review === 'stale' ? '评审已过期' : '评审不通过'}`); continue }
    const problem = pickProblem(item, state!)
    if (problem) { problems.push({ templateId: item.id, problem }); continue }
    templates.push({
      id: item.id, cover: { testRun: item.review!.pick! }, openSale: item.openSale ?? true, publish: item.publish ?? true,
      ...(item.model ? { model: item.model } : {}), ...(item.unpublishReason ? { unpublishReason: item.unpublishReason } : {}),
    } as TemplateItem)
  }
  return { batch: { categories: [], referenceCategories: [], series: [], templates }, problems, skipped }
}
