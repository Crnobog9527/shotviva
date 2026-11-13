'use client'

/* eslint-disable @next/next/no-img-element -- two small static brand marks */
import { ArrowUpRight, Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { cn } from '../../../ui/cn'
import { DisconnectGraylum } from './disconnect-graylum'
import { GRAYLUM_ICON } from './intro-shots'

type Props = { connected: boolean; connectUrl: string; disconnect: () => Promise<void> }

const b = (chunks: ReactNode) => <b className="font-semibold text-foreground">{chunks}</b>

// The connection inside the introduction: Graylum and Shotviva side by side, joined with a
// check once connected and by a broken line before. Connected offers 断开 (two presses);
// not connected sends to Graylum's 集成 page, where connecting starts (ARCHITECTURE §14.2).
export function ConnectionCard({ connected, connectUrl, disconnect }: Props) {
  const t = useTranslations('partner.intro')
  return (
    <div role="group" aria-label={t('connection.label')} data-connection={connected ? 'connected' : 'not-connected'} className="mt-6 grid gap-3 rounded-control bg-card p-4 shadow-[inset_0_0_0_1px_var(--border)]">
      <Pair linked={connected} />
      <p className="text-[15px] leading-[1.55] text-bone-dim">{t.rich(connected ? 'connection.connected' : 'connection.notConnected', { b })}</p>
      {connected ? (
        <DisconnectGraylum disconnect={disconnect} />
      ) : (
        <a
          href={connectUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="press inline-flex h-11 w-fit items-center gap-1.5 rounded-button bg-primary px-4 text-[15px] font-semibold text-primary-foreground"
        >
          {t('connection.connect')}
          <ArrowUpRight aria-hidden className="size-4" strokeWidth={2.2} />
          <span className="sr-only">{t('newTab')}</span>
        </a>
      )}
    </div>
  )
}

function Pair({ linked }: { linked: boolean }) {
  return (
    <span aria-hidden className="flex items-center gap-2">
      <img src={GRAYLUM_ICON.src} alt="" width={40} height={40} className="size-10 rounded-[11px]" />
      <span className="relative flex w-12 items-center justify-center">
        <i className={cn('block w-full', linked ? 'h-0.5 rounded-full bg-success' : 'border-t-2 border-dashed border-[var(--input)]')} />
        {linked && (
          <span className="absolute grid size-5 place-items-center rounded-full bg-success text-background">
            <Check className="size-3" strokeWidth={3.2} />
          </span>
        )}
      </span>
      <img src="/icons/icon-192.png" alt="" width={40} height={40} className="size-10 rounded-[11px]" />
    </span>
  )
}
