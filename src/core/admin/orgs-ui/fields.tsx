import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/core/ui/cn'

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('grid gap-1 text-sm', className)}>
      <span className="font-medium">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  )
}

export function Check({ label, ...props }: ComponentProps<'input'> & { label: string }) {
  return (
    <label className="flex min-h-11 items-center gap-2 text-sm">
      <input type="checkbox" className="size-4" {...props} />
      <span>{label}</span>
    </label>
  )
}

const SELECT = 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-base shadow-xs md:text-sm'
export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(SELECT, className)} {...props} />
}

export function Outcome({ outcome }: { outcome: { ok: boolean; message: string } | null }) {
  if (!outcome) return null
  return <p role={outcome.ok ? 'status' : 'alert'} className={cn('text-sm', outcome.ok ? 'text-muted-foreground' : 'text-destructive')}>{outcome.message}</p>
}

export function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 rounded-lg border border-border bg-card p-4">
      <div>
        <h2 className="font-medium">{title}</h2>
        {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </section>
  )
}
