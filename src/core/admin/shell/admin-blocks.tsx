import type { ReactNode } from 'react'

// Shared admin pieces, Graylum's split (page header, stat card, empty state) on B tokens.

// Up to 1600px wide (T78): the admin is tables first, and at 1920 the old 1152px cap left the
// jobs and orders tables scrolling sideways beside a wide empty margin. One minmax(0, 1fr)
// column: a long unbroken string (a pasted link, an email) wraps or scrolls inside its block
// instead of widening the whole page past a phone's edge.
export function AdminPage({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto grid w-full max-w-[100rem] grid-cols-[minmax(0,1fr)] gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{title}</h1>
        {actions ? <div className="ml-auto flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  )
}

export function StatCard({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">{hint}</p> : null}
    </div>
  )
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {body ? <p className="mt-2 text-sm text-muted-foreground">{body}</p> : null}
    </div>
  )
}
