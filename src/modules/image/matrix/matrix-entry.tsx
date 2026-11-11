'use client'

import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { PaywallButton } from '@/core/billing/paywall/provider'
import type { MembershipTier } from '@/core/config'
import { Link } from '@/core/i18n/ui'
import { cn } from '@/core/ui/cn'

import { MaxBadge } from './max-badge'

export const matrixHref = (templateIds: readonly string[] = []) => (templateIds.length ? `/generate/batch?t=${templateIds.join(',')}` : '/generate/batch')

type Props = { tier: MembershipTier | null; templateId?: string; variant?: 'row' | 'link'; className?: string }

// The way into several templates at once (T107). Max opens the multi-template batch, with this
// workspace's template already in it. Below Max it is the same row with a locked Max badge that
// opens the paywall on Max (DESIGN: a Max feature stays visible to lower tiers).
export function MatrixEntry({ tier, templateId, variant = 'row', className }: Props) {
  const t = useTranslations('app.matrix')
  const locked = tier !== 'max'
  const body =
    variant === 'row' ? (
      <>
        <GridIcon />
        <span className="min-w-0 flex-1">
          <b className="flex items-center gap-2 text-body leading-[1.25] font-semibold">
            {t('entryTitle')}
            <MaxBadge locked={locked} />
          </b>
          <span className="mt-1 block text-caption leading-[1.35] text-muted-foreground">{t('entryLine')}</span>
        </span>
        <Chevron />
      </>
    ) : (
      <>
        <span>{t('entryLink')}</span>
        <MaxBadge locked={locked} />
      </>
    )
  const style =
    variant === 'row'
      ? cn('press hairline flex min-h-16 w-full items-center gap-3 rounded-tile bg-card px-3.5 py-3 text-left', className)
      : cn('press -my-1 inline-flex min-h-11 items-center gap-2 text-caption font-medium text-foreground hover:underline hover:underline-offset-3', className)
  return <EntryTarget locked={locked} href={matrixHref(templateId ? [templateId] : [])} className={style}>{body}</EntryTarget>
}

function EntryTarget({ locked, href, className, children }: { locked: boolean; href: string; className: string; children: ReactNode }) {
  if (locked) {
    return (
      <PaywallButton trigger="tier_required" options={{ step: 'period', tier: 'max' }} className={className}>
        {children}
      </PaywallButton>
    )
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  )
}

function GridIcon() {
  return (
    <span aria-hidden="true" className="grid size-10 flex-none place-items-center rounded-[12px] bg-wash text-primary">
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round">
        <rect x="4" y="4" width="7" height="7" rx="1.5" />
        <rect x="13" y="4" width="7" height="7" rx="1.5" />
        <rect x="4" y="13" width="7" height="7" rx="1.5" />
        <rect x="13" y="13" width="7" height="7" rx="1.5" />
      </svg>
    </span>
  )
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 flex-none text-primary" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}
