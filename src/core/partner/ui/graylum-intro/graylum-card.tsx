'use client'

/* eslint-disable @next/next/no-img-element -- a small static brand mark */
import { ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { cn } from '../../../ui/cn'
import { IntroDialog } from './intro-dialog'
import type { GraylumLinks } from './intro-links'
import { GRAYLUM_ICON } from './intro-shots'

type Props = { connected: boolean; links: GraylumLinks; disconnect: () => Promise<void> }

// Graylum's card in 连接的应用: its icon, name and one line (two at most) on the left, the
// connection's status and a safelight chevron on the right. The whole card is one button that
// opens the introduction.
export function GraylumCard({ connected, links, disconnect }: Props) {
  const t = useTranslations('partner')
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="press grid min-h-16 w-full cursor-pointer grid-cols-[40px_1fr_auto_auto] items-center gap-x-3 py-3 text-left focus-visible:rounded-[10px] focus-visible:outline-offset-[-2px]"
      >
        <img src={GRAYLUM_ICON.src} alt="" width={40} height={40} className="size-10 rounded-[11px]" />
        <span className="grid min-w-0 gap-0.5">
          <b className="text-body leading-[1.3] font-semibold">{t('account.title')}</b>
          <small className="line-clamp-2 text-caption leading-[1.35] text-pretty text-muted-foreground">{t('account.description')}</small>
        </span>
        <span
          data-status={connected ? 'enabled' : 'not-enabled'}
          className={cn(
            'inline-flex h-7 items-center rounded-full px-2.5 text-caption leading-none font-semibold whitespace-nowrap',
            connected ? 'bg-success-tint text-success' : 'bg-wash text-muted-foreground',
          )}
        >
          {connected ? t('integrations.enabled') : t('integrations.notEnabled')}
        </span>
        <ChevronRight aria-hidden strokeWidth={1.75} className="size-[18px] text-primary" />
      </button>
      <IntroDialog open={open} onOpenChange={setOpen} connected={connected} links={links} disconnect={disconnect} />
    </>
  )
}
