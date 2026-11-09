import { useState, useTransition, type FormEvent } from 'react'
import { COPY } from './copy'
import { enrollAffiliate } from './create-action'
import { newAffiliateSlug } from './enrollment'

type Result = Awaited<ReturnType<typeof enrollAffiliate>>

export function useEnrollment() {
  const [slug, setSlug] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [busy, start] = useTransition()
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
  return { slug, setSlug, result, busy, open, submit, cancel: () => setSlug(null), regenerate: () => setSlug(newAffiliateSlug()) }
}
