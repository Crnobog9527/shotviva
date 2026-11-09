'use client'

import { useActionState } from 'react'

import { Button } from '../../ui/button'
import { COPY } from './copy'

export type ToggleAction = (message: string, form: FormData) => Promise<string>

export function ToggleCode({ id, code, active, action }: { id: string; code: string; active: boolean; action: ToggleAction }) {
  const [error, submit, busy] = useActionState(action, '')
  return <form action={submit} className="flex flex-wrap items-center gap-2">
    <input type="hidden" name="id" value={id} />
    <input type="hidden" name="active" value={String(!active)} />
    <span className="text-xs">{active ? COPY.active : COPY.inactive}</span>
    <Button variant="outline" size="xs" aria-label={COPY.toggle(active, code)} disabled={busy}>
      {busy ? COPY.running : active ? COPY.disable : COPY.enable}
    </Button>
    {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
  </form>
}
