import type { FormEventHandler } from 'react'
import { Button } from '@/core/ui/button'
import { COPY } from './copy'
import { Field, Hidden } from './parts'
import { Rates } from './rates'

type Props = {
  userId?: string
  slug: string
  busy: boolean
  error?: string
  onSubmit: FormEventHandler<HTMLFormElement>
  onSlugChange: (value: string) => void
  onRegenerate: () => void
  onCancel: () => void
}

export function EnrollmentForm({ userId, slug, busy, error, onSubmit, onSlugChange, onRegenerate, onCancel }: Props) {
  return (
    <form onSubmit={onSubmit} className="min-w-0 rounded-lg border p-4">
      <fieldset disabled={busy} className="grid min-w-0 gap-3">
        <legend className="mb-3 font-semibold">{userId ? COPY.promote : COPY.create}</legend>
        {userId ? <Hidden name="user_id" value={userId} /> : <>
          <p className="text-sm text-muted-foreground">{COPY.inviteHint}</p>
          <Field label={COPY.accountInput} name="account" maxLength={254} required />
        </>}
        <div className="flex flex-wrap items-end gap-2 [&>label]:w-64 [&>label]:max-w-full">
          <Field label={COPY.slug} name="slug" value={slug} onChange={(e) => onSlugChange(e.target.value)} minLength={3} maxLength={24} required />
          <Button type="button" variant="outline" onClick={onRegenerate}>{COPY.regenerate}</Button>
        </div>
        <Rates optional />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit">{busy ? COPY.saving : COPY.save}</Button>
          <Button type="button" variant="ghost" onClick={onCancel}>{COPY.cancel}</Button>
        </div>
      </fieldset>
    </form>
  )
}
