'use client'
import { Button } from '@/core/ui/button'
import type { Enrollment } from '../enrollment'
import { COPY } from './copy'
import { EnrollmentForm } from './enrollment-form'
import { SavedEnrollment } from './saved-enrollment'
import { useEnrollment } from './use-enrollment'

export function CreateMember({ userId, member }: { userId?: string; member?: Enrollment | null }) {
  const { slug, setSlug, result, busy, open, submit, cancel, regenerate } = useEnrollment()
  if (member) return <SavedEnrollment saved={member} />
  if (result?.ok) return <SavedEnrollment saved={result.member} existing={result.existing} open={userId ? undefined : open} />
  if (slug === null) return <Button className="justify-self-start" onClick={open}>{userId ? COPY.promote : COPY.create}</Button>
  return (
    <EnrollmentForm
      userId={userId}
      slug={slug}
      busy={busy}
      error={result?.message}
      onSubmit={submit}
      onSlugChange={setSlug}
      onRegenerate={regenerate}
      onCancel={cancel}
    />
  )
}
