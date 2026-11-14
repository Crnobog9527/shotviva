import type { ExperimentView } from '../experiments/load'
import { EXPERIMENTS_COPY } from './copy'

// How many people are on each variant now, for the end / archive warnings: visitors assigned to it
// (PostHog, when readable) and accounts whose current variant it is (database).
export function peopleOn(view: ExperimentView): { id: number; label: string; text: string }[] {
  return view.row.experiment_variants.map((variant) => {
    const result = view.results?.find((row) => row.id === variant.id)
    const visitors = result?.visitors
    const accounts = EXPERIMENTS_COPY.confirm.people(result?.nowOn ?? 0)
    const text = visitors === null || visitors === undefined ? accounts : `${visitors} 个访客 · ${accounts}`
    return { id: variant.id, label: variant.label, text }
  })
}
