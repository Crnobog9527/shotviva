import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { ActionBar, ActionNotice } from '@/core/app-shell'
import { PaywallButton } from '@/core/billing/paywall'
import type { Resolution } from '@/core/templates/output-options'
import { buttonVariants } from '@/core/ui/button'

import type { CtaState } from './cta-state'
import { tierName } from './workspace-options'

const LABELS: Record<'wait' | 'need-photo' | 'uploading' | 'need-copy' | 'no-options' | 'need-size' | 'checking', string> = {
  checking: 'checkingCta',
  wait: 'wait',
  'need-photo': 'needPhoto',
  uploading: 'uploadingCta',
  'need-copy': 'needCopy',
  'no-options': 'noOptions',
  'need-size': 'pickSize',
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
// limit: photos developing at once (TIER_LIMITS concurrency), said above a batch's Generate.
type Props = {
  state: CtaState
  resolution: Resolution
  batch: boolean
  onGenerate(): void
  placement?: 'page' | 'sheet'
  addFirst?: number | null
  limit?: number
  // Why the batch preflight said no (T107), when it was not a paywall moment.
  error?: string | null
  // A poster template (gallery-excluded root): free credits still watermark, but never publish.
  privateOnly?: boolean
  // The shop, phone or address fields still holding the cover's text (copy-examples.ts): one line
  // asking whether to use them, in place of the usual notice; Generate stays enabled.
  examplesLeft?: readonly string[]
}

// The creation form's bottom bar: one notice line at most, then the one primary (DESIGN §4.3
// steps 4–5). The free-credit notice shows only when this photo would use free credits; a
// batch (T28) says how many photos and that it is paid credits only.
export function FormAction({ state, resolution, batch, onGenerate, placement = 'page', addFirst = null, limit = 1, error = null, privateOnly = false, examplesLeft = [] }: Props) {
  return (
    <ActionBar inline={placement === 'sheet'} className={placement === 'page' ? PAGE : undefined}>
      <BarNotice state={state} resolution={resolution} addFirst={addFirst} limit={limit} error={error} privateOnly={privateOnly} examplesLeft={examplesLeft} />
      <Primary state={state} batch={batch} onGenerate={onGenerate} />
    </ActionBar>
  )
}

// The bar's one line: the refusal, what Make again costs once its photo is in, the cover's text
// still in the shop / phone / address fields, or the usual notice.
function BarNotice({ state, resolution, addFirst, limit, error, privateOnly, examplesLeft }: Required<Pick<Props, 'state' | 'resolution' | 'addFirst' | 'limit' | 'error' | 'privateOnly' | 'examplesLeft'>>) {
  const t = useTranslations('app.workspace')
  if (error) return <ActionNotice><span role="alert">{error}</span></ActionNotice>
  if (state.kind === 'need-photo' && addFirst !== null) return <ActionNotice>{t.rich('again.addFirst', { ...rich, count: addFirst })}</ActionNotice>
  if (state.kind === 'generate' && examplesLeft.length > 0) {
    return <ActionNotice><span role="status" className="text-primary">{t('examples.left', { fields: examplesLeft.join(t('examples.joiner')) })}</span></ActionNotice>
  }
  return <Notice state={state} resolution={resolution} limit={limit} privateOnly={privateOnly} />
}

// The one primary: Get credits (opens the paywall), Generate, or a disabled label saying what is
// missing.
function Primary({ state, batch, onGenerate }: { state: CtaState; batch: boolean; onGenerate(): void }) {
  const t = useTranslations('app.workspace')
  if (state.kind === 'get-credits') {
    return (
      <PaywallButton trigger="insufficient_credits" options={{ moment: 'credits', needed: state.needed }} className={buttonVariants({ variant: 'cta-neutral', size: 'cta' })}>
        <span>{t.rich('getCreditsCta', { ...rich, count: state.needed })}</span>
      </PaywallButton>
    )
  }
  if (state.kind === 'generate') {
    return (
      <button type="button" onClick={onGenerate} className={buttonVariants({ variant: 'cta', size: 'cta' })}>
        <span>
          {state.count > 1
            ? t.rich('generateBatchCta', { cost: monoCost, count: state.count, total: state.cost })
            : t.rich('generateCta', { cost: monoCost, count: state.cost })}
        </span>
      </button>
    )
  }
  return (
    <button type="button" disabled className={buttonVariants({ variant: 'glass', size: 'cta', className: 'w-full rounded-tile text-cta text-muted-foreground' })}>
      {t(batch ? BATCH_LABELS[state.kind] : LABELS[state.kind])}
    </button>
  )
}

const BATCH_LABELS: typeof LABELS = { ...LABELS, 'need-photo': 'needPhotos', uploading: 'uploadingManyCta' }

function Notice({ state, resolution, limit, privateOnly }: { state: CtaState; resolution: Resolution; limit: number; privateOnly: boolean }) {
  const t = useTranslations('app')
  // A batch is paid credits only (ARCHITECTURE §6.2), so it never gets the free-credit notice.
  if (state.kind === 'generate' && state.count > 1) {
    return <ActionNotice>{t.rich('workspace.batch.notice', { ...rich, count: state.count, each: state.cost / state.count, limit })}</ActionNotice>
  }
  if (state.kind === 'generate' && state.pool === 'free') {
    return <ActionNotice>{t.rich(privateOnly ? 'workspace.freeNoticePrivate' : 'workspace.freeNotice', rich)}</ActionNotice>
  }
  if (state.kind === 'get-credits' && state.count > 1) {
    return <ActionNotice>{t.rich('workspace.batchNeedsPaid', { ...rich, count: state.count, total: state.cost })}</ActionNotice>
  }
  if (state.kind === 'get-credits') {
    return <ActionNotice>{t.rich('workspace.needsCredits', { ...rich, tier: tierName(resolution, t), count: state.cost })}</ActionNotice>
  }
  if (state.kind === 'wait') return <ActionNotice>{t('workspace.waitNotice', { count: state.limit })}</ActionNotice>
  return null
}
