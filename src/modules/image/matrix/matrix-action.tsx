'use client'

import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { ActionBar, ActionNotice } from '@/core/app-shell'
import { PaywallButton } from '@/core/billing/paywall/provider'
import { buttonVariants } from '@/core/ui/button'

import { MATRIX_MAX_CELLS } from './matrix-state'
import type { MatrixCta } from './matrix-cta'

const mono = (chunks: ReactNode) => <span className="font-mono text-caption font-medium opacity-[.72]">{chunks}</span>
const b = (chunks: ReactNode) => <b className="font-medium text-foreground">{chunks}</b>

const PAGE = 'md:px-0 lg:sticky lg:bottom-0 lg:z-10 lg:mt-4 lg:bg-[linear-gradient(transparent,var(--background)_16px)] lg:pt-6 lg:pb-6'

// The batch's one primary (DESIGN §4.3, The One Primary Rule): Generate with the count and the
// total the grid shows, Get credits when the paid pool does not cover it (a batch is paid
// credits only), or a disabled label saying what is missing. One notice line above it at most.
export function MatrixAction({ cta, error, onGenerate }: { cta: MatrixCta; error: string | null; onGenerate(): void }) {
  const t = useTranslations('app.matrix')
  const notice = error ? <span role="alert">{error}</span>
    : cta.kind === 'generate' ? t.rich('noticeGenerate', { b })
    : cta.kind === 'get-credits' ? t.rich('noticeCredits', { b, count: cta.count, total: cta.total })
    : cta.kind === 'blocked' && cta.block === 'too-many' ? t.rich('noticeTooMany', { b, max: MATRIX_MAX_CELLS })
    : null
  return (
    <ActionBar className={PAGE}>
      {notice ? <ActionNotice>{notice}</ActionNotice> : null}
      <Primary cta={cta} onGenerate={onGenerate} />
    </ActionBar>
  )
}

function Primary({ cta, onGenerate }: { cta: MatrixCta; onGenerate(): void }) {
  const t = useTranslations('app.matrix')
  if (cta.kind === 'get-credits') {
    return (
      <PaywallButton trigger="insufficient_credits" className={buttonVariants({ variant: 'cta-neutral', size: 'cta' })}>
        <span>{t.rich('getCredits', { mono, count: cta.needed })}</span>
      </PaywallButton>
    )
  }
  if (cta.kind === 'generate') {
    return (
      <button type="button" onClick={onGenerate} className={buttonVariants({ variant: 'cta', size: 'cta' })}>
        <span>{t.rich('generate', { mono, count: cta.count, total: cta.total })}</span>
      </button>
    )
  }
  return (
    <button type="button" disabled className={buttonVariants({ variant: 'glass', size: 'cta', className: 'w-full rounded-tile text-cta text-muted-foreground' })}>
      {t(cta.kind === 'checking' ? 'checking' : `block.${cta.block}`)}
    </button>
  )
}
