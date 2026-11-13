'use client'

import { useTranslations } from 'next-intl'
import { useState, type ReactNode } from 'react'

import { ConnectMarks } from './connect-marks'

export type AuthorizeTarget = { action: string; state: string; returnTo: string | null; graylumHome: string }

type Props = { target: AuthorizeTarget; children(submit: ReactNode): ReactNode; label: string; variant: 'primary' | 'ghost' }

// The Allow form (ARCHITECTURE §14.2): a plain POST to …/authorize, which answers with a real
// 302 to Graylum, so it works before hydration. Once submitted the plate turns into "Connected,
// taking you back" (B comp connect.html ?v=done) while the browser follows the redirect.
export function AuthorizeForm(props: Props) {
  const [sent, setSent] = useState(false)
  return <AuthorizePlate {...props} sent={sent} onSubmit={() => setSent(true)} />
}

// The form must stay in the document after submit: unmounting it in the same render cancels the
// browser's POST ("Form submission canceled because the form is not connected"), so no code and
// no 302 back to Graylum. "Done" is shown on top and the original plate is only hidden.
export function AuthorizePlate({ target, children, label, variant, sent, onSubmit }: Props & { sent: boolean; onSubmit(): void }) {
  const button =
    variant === 'primary'
      ? 'press w-full min-h-14 rounded-tile bg-primary px-4 text-cta font-semibold tracking-[-0.01em] text-primary-foreground shadow-raised'
      : 'press w-full min-h-12 rounded-button bg-wash px-4 text-label font-semibold shadow-[inset_0_0_0_1px_var(--border)]'
  const submit = (
    <form action={target.action} method="post" onSubmit={onSubmit}>
      <input type="hidden" name="state" value={target.state} />
      {target.returnTo ? <input type="hidden" name="return_to" value={target.returnTo} /> : null}
      <button type="submit" className={button}>
        {label}
      </button>
    </form>
  )
  return (
    <>
      {sent ? <ConnectDone graylumHome={target.graylumHome} /> : null}
      <div hidden={sent}>{children(submit)}</div>
    </>
  )
}

function ConnectDone({ graylumHome }: { graylumHome: string }) {
  const t = useTranslations('partner.connect.done')
  return (
    <section aria-labelledby="connect-done" role="status">
      <ConnectMarks connected />
      <h1 id="connect-done" className="font-display text-[32px] leading-[1.05] tracking-[-0.02em] text-balance md:text-[36px]">
        {t('title')}
      </h1>
      <p className="mt-2 text-body leading-normal text-pretty text-bone-dim">
        {t.rich('line', { link: (chunks) => <a href={graylumHome} className="text-foreground underline underline-offset-3">{chunks}</a> })}
      </p>
      <div className="mt-6 grid size-14 place-items-center rounded-[18px] bg-wash text-primary shadow-[inset_0_0_0_1px_var(--border)]">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[26px] motion-safe:animate-spin motion-safe:[animation-duration:1.6s]" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
          <path d="M12 3.5a8.5 8.5 0 1 1-8.5 8.5" />
        </svg>
      </div>
    </section>
  )
}
