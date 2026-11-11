'use client'

import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { ActionNotice } from '@/core/app-shell'
import { PaywallButton } from '@/core/billing/paywall'
import { buttonVariants } from '@/core/ui/button'
import { cn } from '@/core/ui/cn'

import type { EditCta } from './edit-cta'

const rich = {
  b: (chunks: ReactNode) => <b className="font-medium text-foreground">{chunks}</b>,
  cost: (chunks: ReactNode) => <span className="font-mono text-caption font-medium opacity-[.72]">{chunks}</span>,
  mono: (chunks: ReactNode) => <span className="font-mono">{chunks}</span>,
}

// The panel's bottom bar (T6 comp): one notice line, then the one primary. An empty field keeps
// Generate dim but pressable (aria-disabled), so the press can point at the field.
export function EditAction({ cta, tier, onGenerate, onEmpty }: { cta: EditCta; tier: string; onGenerate(): void; onEmpty(): void }) {
  const t = useTranslations('app')
  return (
    <div className="relative border-t border-hairline bg-popover pt-4 pb-[calc(var(--sab)+16px)] before:pointer-events-none before:absolute before:inset-x-0 before:-top-5 before:h-5 before:bg-gradient-to-t before:from-popover md:pb-0">
      <ActionNotice>{notice(cta, tier, t)}</ActionNotice>
      {cta.kind === 'get-credits' ? (
        <PaywallButton trigger="insufficient_credits" options={{ moment: 'credits', needed: cta.needed }} className={buttonVariants({ variant: 'cta-neutral', size: 'cta' })}>
          <span>{t.rich('workspace.getCreditsCta', { ...rich, count: cta.needed })}</span>
        </PaywallButton>
      ) : (
        <button
          type="button"
          aria-disabled={cta.kind === 'empty'}
          onClick={cta.kind === 'empty' ? onEmpty : onGenerate}
          className={cn(buttonVariants({ variant: 'cta', size: 'cta' }), cta.kind === 'empty' && 'opacity-50')}
        >
          <span>{t.rich('workspace.generateCta', { cost: rich.cost, count: cta.cost })}</span>
        </button>
      )}
    </div>
  )
}

function notice(cta: EditCta, tier: string, t: ReturnType<typeof useTranslations<'app'>>): ReactNode {
  if (cta.kind === 'get-credits') return t.rich('workspace.needsCredits', { ...rich, tier, count: cta.cost })
  if (cta.kind === 'empty') return t.rich('edit.noticeEmpty', rich)
  return cta.pool === 'free' ? t.rich('edit.noticeFree', rich) : t('edit.noticeReady')
}
