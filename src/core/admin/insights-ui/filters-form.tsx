import { LOCALE_FILTERS, SOURCE_FILTERS } from '../insights/funnel'
import { BUCKETS } from '../insights/period'
import { INSIGHTS_COPY as COPY } from './copy'
import type { InsightsQuery } from './query'

const FIELD = 'grid gap-1 text-sm'
const INPUT = 'h-9 min-w-0 rounded-md border border-input bg-background px-2 text-sm'

type Option = { value: string; label: string }

function Select({ name, label, value, options }: { name: string; label: string; value: string; options: Option[] }) {
  return (
    <label className={FIELD}>
      <span className="text-muted-foreground">{label}</span>
      <select name={name} defaultValue={value} className={INPUT}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

// A plain GET form: the filters live in the URL and the page renders on the server, no client JS.
// Group and sort ride along as hidden fields so changing dates keeps the table as it was.
export function FiltersForm({ query, days }: { query: InsightsQuery; days: number }) {
  const funnel = query.view === 'funnel'
  return (
    <form method="get" aria-label={COPY.filters.label} className="grid gap-2">
      <input type="hidden" name="view" value={query.view} />
      {!funnel ? <input type="hidden" name="group" value={query.group} /> : null}
      {!funnel ? <input type="hidden" name="sort" value={query.sort} /> : null}
      <div className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap">
        <label className={FIELD}>
          <span className="text-muted-foreground">{COPY.filters.from}</span>
          <input type="date" name="from" defaultValue={query.from} className={INPUT} />
        </label>
        <label className={FIELD}>
          <span className="text-muted-foreground">{COPY.filters.to}</span>
          <input type="date" name="to" defaultValue={query.to} className={INPUT} />
        </label>
        {funnel ? (
          <>
            <Select name="bucket" label={COPY.filters.bucket} value={query.bucket} options={BUCKETS.map((b) => ({ value: b, label: COPY.filters.buckets[b] }))} />
            <Select name="locale" label={COPY.filters.locale} value={query.locale} options={LOCALE_FILTERS.map((l) => ({ value: l, label: COPY.filters.locales[l] }))} />
            <Select name="source" label={COPY.filters.source} value={query.source} options={SOURCE_FILTERS.map((s) => ({ value: s, label: COPY.sources[s] }))} />
          </>
        ) : (
          <label className={FIELD}>
            <span className="text-muted-foreground">{COPY.filters.redraw}</span>
            <input type="number" name="redraw" min={1} max={500} step={1} defaultValue={Math.round(query.redraw * 100)} className={`${INPUT} sm:w-28`} />
          </label>
        )}
        <button type="submit" className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          {COPY.filters.apply}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">{COPY.filters.rangeNote(days)}</p>
    </form>
  )
}
