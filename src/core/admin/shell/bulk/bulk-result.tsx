'use client'

import { BULK_COPY as COPY } from './copy'

const SHOWN = 8

export type ShownSkip = { id: string; who: string; why: string }

// A finished batch, record by record: how many changed, and each one left alone with the reason,
// so nothing is skipped silently.
export function BulkResult({ done, skipped }: { done: number; skipped: readonly ShownSkip[] }) {
  const rest = skipped.length - SHOWN
  return (
    <div role="status" className="grid gap-2 rounded-md border border-border bg-[var(--wash-faint)] p-3 text-sm">
      <p className="font-medium">{done > 0 ? COPY.done(done) : COPY.nothingDone}</p>
      {skipped.length > 0 ? (
        <>
          <p className="text-muted-foreground">{COPY.skipped(skipped.length)}</p>
          <ul className="grid gap-1">
            {skipped.slice(0, SHOWN).map((skip) => (
              <li key={skip.id} className="grid gap-0.5">
                <span className="truncate font-mono text-xs">{skip.who}</span>
                <span className="text-xs text-muted-foreground">{skip.why}</span>
              </li>
            ))}
          </ul>
          {rest > 0 ? <p className="text-xs text-muted-foreground">{COPY.more(rest)}</p> : null}
        </>
      ) : null}
    </div>
  )
}

const WHO_SHOWN = 6

// Who a batch will touch: the count is in the title, the first few here to check before confirming.
export function BulkTargets({ label, names }: { label: string; names: readonly string[] }) {
  const rest = names.length - WHO_SHOWN
  return (
    <div className="grid gap-1 rounded-md border border-border bg-[var(--wash-faint)] p-3 text-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <ul className="grid gap-0.5">
        {names.slice(0, WHO_SHOWN).map((name, index) => (
          <li key={`${index}-${name}`} className="truncate font-mono text-xs">
            {name}
          </li>
        ))}
      </ul>
      {rest > 0 ? <p className="text-xs text-muted-foreground">{COPY.more(rest)}</p> : null}
    </div>
  )
}
