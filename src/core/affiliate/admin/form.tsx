'use client'
import { useActionState, type ReactNode } from 'react'
import { Button } from '@/core/ui/button'
import { COPY } from './copy'
export type SaveAction = (prev: string, form: FormData) => Promise<string>
type Props = { action: SaveAction; operation: string; children: ReactNode; label: string; destructive?: boolean }
export function MutationForm({ action, operation, children, label, destructive }: Props) {
  const [message, submit, busy] = useActionState(action, '')
  return (
    <form action={submit} className="grid gap-3 rounded-lg border border-border p-4">
      <input type="hidden" name="operation" value={operation} />
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" variant={destructive ? 'destructive' : 'default'} disabled={busy}>
          {busy ? COPY.saving : label}
        </Button>
        <span role="status" className="text-sm text-muted-foreground">
          {message}
        </span>
      </div>
    </form>
  )
}
