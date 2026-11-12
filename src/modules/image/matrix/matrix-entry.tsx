'use client'

import { useTranslations } from 'next-intl'

import type { MembershipTier } from '@/core/config'
import { Link } from '@/core/i18n/ui'
import { cn } from '@/core/ui/cn'

import { IntroTrigger } from '../gated/intro-trigger'
import { MaxBadge } from './max-badge'

const matrixHref = (templateIds: readonly string[] = []) => (templateIds.length ? `/generate/batch?t=${templateIds.join(',')}` : '/generate/batch')

type Props = { tier: MembershipTier | null; templateId?: string; className?: string }

// A template's way into several templates at once (T107), under its form. Max opens the
// multi-template batch with this template already in it; below Max the same link carries a
// locked Max badge and opens the feature's intro first (Owner 2026-11-12), which then offers
// the paywall on Max. The Create page lists the feature among its gated ways (gated-features).
export function MatrixEntry({ tier, templateId, className }: Props) {
  const t = useTranslations('app.matrix')
  const locked = tier !== 'max'
  const style = cn('press -my-1 inline-flex min-h-11 items-center gap-2 text-caption font-medium text-foreground hover:underline hover:underline-offset-3', className)
  const body = (
    <>
      <span>{t('entryLink')}</span>
      <MaxBadge locked={locked} />
    </>
  )
  if (locked) {
    return (
      <IntroTrigger tab="templates" tier={tier} upgrade="max" className={style}>
        {body}
      </IntroTrigger>
    )
  }
  return (
    <Link href={matrixHref(templateId ? [templateId] : [])} className={style}>
      {body}
    </Link>
  )
}
