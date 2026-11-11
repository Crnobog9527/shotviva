import type { Job } from './job-schema'

// true: a cut-out, so downloads offer 白底 / 透明底. false: asked for opaque. null: unknown (the
// model chose, or the work predates the record); the browser may still find see-through pixels
// in a clean work it has loaded, and the download route honours a choice unless this is false.
// Plain checks, no schema: Photos builds this in the browser too, so it stays a few bytes.
export function isCutOut(job: Pick<Job, 'inputs'>): boolean | null {
  const background = job.inputs.background
  if (background === 'transparent') return true
  return background === 'opaque' ? false : null
}
