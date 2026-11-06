'use client'

import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { Link } from '../../i18n/ui'
import { AuthorizeForm, type AuthorizeTarget } from './authorize-form'
import { ConnectMarks } from './connect-marks'

const TITLE = 'font-display text-[32px] leading-[1.05] tracking-[-0.02em] text-balance md:text-[36px]'
const SUB = 'mt-2 text-body leading-normal text-pretty text-bone-dim'
const QUIET = 'press inline-flex min-h-12 w-full items-center justify-center rounded-button px-4 text-label font-semibold text-bone-dim hover:text-foreground'
const GHOST = 'press inline-flex min-h-12 w-full items-center justify-center rounded-button bg-wash px-4 text-label font-semibold shadow-[inset_0_0_0_1px_var(--border)]'
const bold = (chunks: ReactNode) => <b className="font-medium text-foreground">{chunks}</b>

type AllowProps = { target: AuthorizeTarget; email: string; balance: ReactNode; switchAccount: () => Promise<void> }

// Signed in, not connected yet (B comp connect.html ?v=allow): what Graylum gets, the balance,
// "Allow Graylum", and a way back out.
export function ConnectAllow({ target, email, balance, switchAccount }: AllowProps) {
  const t = useTranslations('partner.connect.allow')
  return (
    <AuthorizeForm target={target} label={t('cta')} variant="primary">
      {(submit) => (
        <section aria-labelledby="connect-allow">
          <ConnectMarks connected={false} />
          <h1 id="connect-allow" className={TITLE}>{t('title')}</h1>
          <p className={SUB}>{t.rich('signedIn', { email, b: bold })}</p>
          <ul className="mt-5 border-t border-hairline">
            <Grant icon={<path d="M8 12h8M12 8v8" />} frame title={t('makeTitle')} line={t('makeLine')} />
            <Grant icon={<path d="M12 8v4.5M12 16h.01" />} circle title={t('balanceTitle')} line={t('balanceLine')} />
            <Grant icon={<path d="M6 6l12 12M18 6L6 18" />} title={t('disconnectTitle')} line={t('disconnectLine')} />
          </ul>
          <div className="mt-4">{balance}</div>
          <div className="mt-6 grid gap-2">
            {submit}
            <a href={target.graylumHome} className={QUIET}>{t('cancel')}</a>
          </div>
          <form action={switchAccount} className="mt-4 text-caption leading-normal text-muted-foreground">
            {t.rich('notYou', {
              link: (chunks) => <button type="submit" className="text-bone-dim hover:text-foreground hover:underline hover:underline-offset-3">{chunks}</button>,
            })}
          </form>
        </section>
      )}
    </AuthorizeForm>
  )
}

function Grant({ icon, title, line, frame = false, circle = false }: { icon: ReactNode; title: string; line: string; frame?: boolean; circle?: boolean }) {
  return (
    <li className="flex items-start gap-3 border-b border-hairline py-3 text-[15px] leading-[1.45]">
      <svg viewBox="0 0 24 24" aria-hidden="true" className="mt-0.5 size-5 flex-none text-bone-dim" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
        {frame && <rect x="3.5" y="5.5" width="17" height="13" rx="3" />}
        {circle && <circle cx="12" cy="12" r="8.5" />}
        {icon}
      </svg>
      <div>
        <b className="block font-medium">{title}</b>
        <span className="text-caption text-muted-foreground">{line}</span>
      </div>
    </li>
  )
}

// Already connected (?v=already): going back re-runs the same Allow, which re-links with no change.
export function ConnectAlready({ target, linkedAt }: { target: AuthorizeTarget; linkedAt: Date }) {
  const t = useTranslations('partner.connect.already')
  return (
    <AuthorizeForm target={target} label={t('back')} variant="primary">
      {(submit) => (
        <section aria-labelledby="connect-already">
          <ConnectMarks connected />
          <h1 id="connect-already" className={TITLE}>{t('title')}</h1>
          <p className={SUB}>{t('line', { date: linkedAt })}</p>
          <div className="mt-6 grid gap-2">
            {submit}
            <Link href="/account" className={QUIET}>{t('manage')}</Link>
          </div>
        </section>
      )}
    </AuthorizeForm>
  )
}

export type ConnectFailure = 'invalid' | 'failed'

// The link is not valid (state, return address off the allowlist, a code that expired or was
// used, ARCHITECTURE §14.2), or minting the code failed (?v=error). Nothing was connected.
export function ConnectError({ failure, graylumHome }: { failure: ConnectFailure; graylumHome: string }) {
  const t = useTranslations('partner.connect.error')
  return (
    <section aria-labelledby="connect-error">
      <div aria-hidden="true" className="mb-5 grid size-14 place-items-center rounded-[18px] bg-wash shadow-[inset_0_0_0_1px_var(--border)]">
        <svg viewBox="0 0 24 24" className="size-[26px]" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 8v5M12 16h.01" />
        </svg>
      </div>
      <h1 id="connect-error" className={TITLE}>{t(`${failure}Title`)}</h1>
      <p className={SUB}>{t(`${failure}Line`)}</p>
      <div className="mt-6 grid gap-2">
        <a href={graylumHome} className={GHOST}>{t('back')}</a>
        <Link href="/generate" className={QUIET}>{t('toShotviva')}</Link>
      </div>
      <p className="mt-4 text-caption leading-normal text-muted-foreground">{t('fine')}</p>
    </section>
  )
}
