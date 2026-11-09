'use client'
import { useState, useTransition, type FormEvent } from 'react'
import { Button } from '@/core/ui/button'
import { COPY } from './copy'
import { enrollAffiliate } from './create-action'
import { enrollmentLabel, newAffiliateSlug, type Enrollment } from './enrollment'
import { Field, Hidden } from './parts'
import { Rates } from './rates'

type Result = Awaited<ReturnType<typeof enrollAffiliate>>

export function CreateMember({ userId, member }: { userId?: string; member?: Enrollment | null }) {
  if (member) return <Saved saved={member} />
  return <NewEnrollment userId={userId} />
}

function NewEnrollment({ userId }: { userId?: string }) {
  const [slug, setSlug] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [busy, start] = useTransition()
  const label = userId ? COPY.promote : COPY.create
  function open() {
    setResult(null)
    setSlug(newAffiliateSlug())
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    start(async () => {
      const response = await enrollAffiliate(form).catch(() => ({ ok: false as const, message: COPY.failed }))
      setResult(response)
    })
  }
  if (result?.ok) return <Saved saved={result.member} existing={result.existing} open={userId ? undefined : open} />
  if (slug === null) return <Button className="justify-self-start" onClick={open}>{label}</Button>
  return (
    <form onSubmit={submit} className="min-w-0 rounded-lg border p-4">
      <fieldset disabled={busy} className="grid min-w-0 gap-3">
        <legend className="mb-3 font-semibold">{label}</legend>
        {userId ? <Hidden name="user_id" value={userId} /> : <>
          <p className="text-sm text-muted-foreground">{COPY.inviteHint}</p>
          <Field label={COPY.accountInput} name="account" maxLength={254} required />
        </>}
        <div className="flex flex-wrap items-end gap-2 [&>label]:w-64 [&>label]:max-w-full">
          <Field label={COPY.slug} name="slug" value={slug} onChange={(e) => setSlug(e.target.value)} minLength={3} maxLength={24} required />
          <Button type="button" variant="outline" onClick={() => setSlug(newAffiliateSlug())}>{COPY.regenerate}</Button>
        </div>
        <Rates optional />
        {result?.ok === false && <p role="alert" className="text-sm text-destructive">{result.message}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit">{busy ? COPY.saving : COPY.save}</Button>
          <Button type="button" variant="ghost" onClick={() => setSlug(null)}>{COPY.cancel}</Button>
        </div>
      </fieldset>
    </form>
  )
}

function Saved({ saved, existing, open }: { saved: Enrollment; existing?: boolean; open?: () => void }) {
  return (
    <section className="grid justify-items-start gap-2 rounded-lg border p-3">
      <p role="status" className="break-all text-sm">
        {existing !== undefined && (existing ? COPY.existing : COPY.saved + '。')}
        {COPY.identity} · {enrollmentLabel(saved)} · <code>?ref={saved.slug}</code>
      </p>
      {open && <Button variant="outline" onClick={open}>{COPY.another}</Button>}
    </section>
  )
}
