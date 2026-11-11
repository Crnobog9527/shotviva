import type { TrackedJob } from '../generation/job-model'

// The multi-template batch's results (T107 「结果可以按模板看，也可以按照片看」): the same jobs
// grouped by template (each template's photos) or by photo (each photo through every
// template), groups and members in batch order. Pure, for the results view and its test.
export type ResultView = 'template' | 'photo'

export type ResultGroup = { key: string; title: string; photoIndex: number | null; templateId: string | null; previewUrl?: string; jobs: TrackedJob[] }

type Indexed = { job: TrackedJob; photo: number }

// Photos are numbered by first appearance in batch order, which is how the grid listed them.
function numbered(jobs: readonly TrackedJob[]): Indexed[] {
  const order = new Map<string, number>()
  return jobs.map((job) => {
    const key = job.inputKey ?? job.id
    if (!order.has(key)) order.set(key, order.size + 1)
    return { job, photo: order.get(key)! }
  })
}

export function resultGroups(jobs: readonly TrackedJob[], view: ResultView): ResultGroup[] {
  const groups = new Map<string, ResultGroup>()
  for (const { job, photo } of numbered(jobs)) {
    const key = view === 'template' ? job.templateId : (job.inputKey ?? job.id)
    const group = groups.get(key) ?? {
      key,
      title: view === 'template' ? job.templateName : '',
      photoIndex: view === 'photo' ? photo : null,
      templateId: view === 'template' ? job.templateId : null,
      previewUrl: view === 'photo' ? job.previewUrl : undefined,
      jobs: [],
    }
    group.jobs.push(job)
    groups.set(key, group)
  }
  return [...groups.values()]
}

// The photo number of each job, for the tile labels of the by-template view.
export function photoNumbers(jobs: readonly TrackedJob[]): Map<string, number> {
  return new Map(numbered(jobs).map(({ job, photo }) => [job.id, photo]))
}
