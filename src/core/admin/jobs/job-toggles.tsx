import { formatBeijing } from '../shell/format'
import { JOBS_COPY as COPY } from './copy'
import type { JobToggle } from './job-toggles-row'

// Under a job's template id: each toggle the job had (T89), on ones in amber with when the user
// confirmed it, so a 客诉 can see the user turned it on themselves.
export function JobToggles({ toggles }: { toggles: readonly JobToggle[] }) {
  return toggles.map((toggle) => (
    <div key={toggle.key} className={toggle.on ? 'mt-1 text-xs text-amber-700 dark:text-amber-400' : 'mt-1 text-xs text-muted-foreground'}>
      {COPY.toggle(toggle.key, toggle.on)}
      {toggle.on && toggle.confirmedAt ? ` · ${COPY.toggleConfirmed(formatBeijing(toggle.confirmedAt) ?? toggle.confirmedAt)}` : null}
    </div>
  ))
}
