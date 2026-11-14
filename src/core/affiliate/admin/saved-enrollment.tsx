import { Button } from '@/core/ui/button'
import type { Enrollment } from '../enrollment'
import { ConsumerReferral } from './consumer-referral'
import { COPY } from './copy'
import { enrollmentLabel } from './enrollment'

export function SavedEnrollment({ saved, existing, open }: { saved: Enrollment; existing?: boolean; open?: () => void }) {
  return (
    <section className="grid justify-items-start gap-2 rounded-lg border p-3">
      <p role="status" className="break-all text-sm">
        {existing !== undefined && (existing ? COPY.existing : COPY.saved + '。')}
        {COPY.identity} · {enrollmentLabel(saved)} · {COPY.slug} <code>{saved.slug}</code>
      </p>
      {saved.status === 'active' && <ConsumerReferral slug={saved.slug} />}
      {open && <Button variant="outline" onClick={open}>{COPY.another}</Button>}
    </section>
  )
}
