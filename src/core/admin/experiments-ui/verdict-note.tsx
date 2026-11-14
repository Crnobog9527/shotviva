import type { VariantResult, Verdict } from '../experiments/results'
import { EXPERIMENTS_COPY } from './copy'

const COPY = EXPERIMENTS_COPY.verdict

function estimateText(daysLeft: number | null) {
  return daysLeft === null ? COPY.noEstimate : COPY.estimate(daysLeft)
}

// Plain words on whether the numbers can be trusted yet; never a winner on a small sample.
export function VerdictNote({ verdict, results }: { verdict: Verdict; results: VariantResult[] }) {
  const labels = (ids: number[]) => ids.map((id) => results.find((row) => row.id === id)?.label ?? String(id))
  return (
    <div className="grid gap-1 rounded-md bg-muted p-3 text-sm">
      {verdict.kind === 'difference' ? (
        <p className="font-medium">{COPY.difference(labels(verdict.better), labels(verdict.worse))}</p>
      ) : (
        <p className="font-medium">{COPY[verdict.kind]}</p>
      )}
      {verdict.kind === 'not_enough' || verdict.kind === 'no_difference' ? <p className="text-muted-foreground">{estimateText(verdict.daysLeft)}</p> : null}
      <p className="text-xs text-muted-foreground">{COPY.rule}</p>
    </div>
  )
}
