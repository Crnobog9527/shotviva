import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { ActionBar, ActionNotice } from '@/core/app-shell'
import { PaywallButton } from '@/core/billing/paywall'
import type { Resolution } from '@/core/templates/output-options'
import { buttonVariants } from '@/core/ui/button'

import type { CtaState } from './cta-state'
import { tierName } from './workspace-options'

const LABELS: Record<'wait' | 'need-photo' | 'uploading' | 'need-copy', string> = {
  wait: 'wait',
  'need-photo': 'needPhoto',
  uploading: 'uploadingCta',
  'need-copy': 'needCopy',
}

// Rich-text tags the workspace messages use: the cost after the middle dot, a number in mono,
// and the key sentence of a notice in bone. Whole sentences stay in one message so word order
// can change per language.
const rich = {
  cost: (chunks: ReactNode) => <span className="text-caption font-medium opacity-[.72]">{chunks}</span>,
  mono: (chunks: ReactNode) => <span className="font-mono">{chunks}</span>,
  b: (chunks: ReactNode) => <b className="font-medium text-foreground">{chunks}</b>,
}

const monoCost = (chunks: ReactNode) => <span className="font-mono text-caption font-medium opacity-[.72]">{chunks}</span>

// Where the bar sits: the workspace page (fixed on phones, the end of the form below lg, sticky
// at the bottom of the form column from lg, B comp workspace.html) or pinned in the creation
// dialog under its scrolling form.
const PAGE = 'md:px-0 lg:sticky lg:bottom-0 lg:z-10 lg:mt-4 lg:bg-[linear-gradient(transparent,var(--background)_16px)] lg:pt-6 lg:pb-6'

// addFirst: Make again without its photo (T40) says what it will cost once the photo is in.
type Props = { state: CtaState; resolution: Resolution; batch: boolean; onGenerate(): void; placement?: 'page' | 'sheet'; addFirst?: number | null }

// The creation form's bottom bar: one notice line at most, then the one primary (DESIGN §4.3
// steps 4–5). The free-credit notice shows only when this photo would use free credits; a
// batch (T28) says how many photos and that it is paid credits only.
export function FormAction({ state, resolution, batch, onGenerate, placement = 'page', addFirst = null }: Props) {
  const t = useTranslations('app.workspace')
  return (
    <ActionBar inline={placement === 'sheet'} className={placement === 'page' ? PAGE : undefined}>
      {state.kind === 'need-photo' && addFirst !== null ? (
        <ActionNotice>{t.rich('again.addFirst', { ...rich, count: addFirst })}</ActionNotice>
      ) : (
        <Notice state={state} resolution={resolution} />
      )}
      {state.kind === 'get-credits' ? (
        <PaywallButton trigger="insufficient_credits" className={buttonVariants({ variant: 'cta-neutral', size: 'cta' })}>
          <span>{t.rich('getCreditsCta', { ...rich, count: state.needed })}</span>
        </PaywallButton>
      ) : state.kind === 'generate' ? (
        <button type="button" onClick={onGenerate} className={buttonVariants({ variant: 'cta', size: 'cta' })}>
          <span>
            {state.count > 1
              ? t.rich('generateBatchCta', { cost: monoCost, count: state.count, total: state.cost })
              : t.rich('generateCta', { cost: monoCost, count: state.cost })}
          </span>
        </button>
      ) : (
        <button type="button" disabled className={buttonVariants({ variant: 'glass', size: 'cta', className: 'w-full rounded-tile text-cta text-muted-foreground' })}>
          {t(batch ? BATCH_LABELS[state.kind] : LABELS[state.kind])}
        </button>
      )}
    </ActionBar>
  )
}

const BATCH_LABELS: typeof LABELS = { ...LABELS, 'need-photo': 'needPhotos', uploading: 'uploadingManyCta' }

function Notice({ state, resolution }: { state: CtaState; resolution: Resolution }) {
  const t = useTranslations('app')
  if (state.kind === 'generate' && state.pool === 'free') return <ActionNotice>{t.rich('workspace.freeNotice', rich)}</ActionNotice>
  if (state.kind === 'get-credits' && state.count > 1) {
    return <ActionNotice>{t.rich('workspace.batchNeedsPaid', { ...rich, count: state.count, total: state.cost })}</ActionNotice>
  }
  if (state.kind === 'get-credits') {
    return <ActionNotice>{t.rich('workspace.needsCredits', { ...rich, tier: tierName(resolution, t), count: state.cost })}</ActionNotice>
  }
  if (state.kind === 'wait') return <ActionNotice>{t('workspace.waitNotice', { count: state.limit })}</ActionNotice>
  return null
}
