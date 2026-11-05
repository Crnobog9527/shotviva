import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { ActionBar, ActionNotice, PAYWALL_HREF } from '@/core/app-shell'
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

// The workspace's bottom bar: one notice line at most, then the one primary (DESIGN §4.3
// steps 4–5). The free-credit notice shows only when this photo would use free credits.
export function FormAction({ state, resolution, onGenerate }: { state: CtaState; resolution: Resolution; onGenerate(): void }) {
  const t = useTranslations('app')
  return (
    <ActionBar>
      <Notice state={state} resolution={resolution} />
      {state.kind === 'get-credits' ? (
        <Link href={PAYWALL_HREF} className={buttonVariants({ variant: 'cta-neutral', size: 'cta' })}>
          {t('workspace.getCredits')}{' '}
          <span className="font-medium opacity-[.72]">
            · <span className="font-mono text-caption">{state.needed}</span> {t('workspace.needed')}
          </span>
        </Link>
      ) : state.kind === 'generate' ? (
        <button type="button" onClick={onGenerate} className={buttonVariants({ variant: 'cta', size: 'cta' })}>
          {t('workspace.generate')} <Cost>· {t('credits', { count: state.cost })}</Cost>
        </button>
      ) : (
        <button type="button" disabled className={buttonVariants({ variant: 'glass', size: 'cta', className: 'w-full rounded-tile text-cta text-muted-foreground' })}>
          {t(`workspace.${LABELS[state.kind]}`)}
        </button>
      )}
    </ActionBar>
  )
}

function Cost({ children }: { children: ReactNode }) {
  return <span className="font-mono text-caption font-medium opacity-[.72]">{children}</span>
}

function Notice({ state, resolution }: { state: CtaState; resolution: Resolution }) {
  const t = useTranslations('app')
  const key = (text: string) => <b className="font-medium text-foreground">{text}</b>
  if (state.kind === 'generate' && state.pool === 'free') {
    return (
      <ActionNotice>
        {t('workspace.freeNotice')} {key(t('workspace.freeNoticeKey'))}
      </ActionNotice>
    )
  }
  if (state.kind === 'get-credits') {
    return (
      <ActionNotice>
        {t('workspace.needsCredits', { tier: tierName(resolution, t), count: state.cost })} {key(t('workspace.needsCreditsKey'))}
      </ActionNotice>
    )
  }
  if (state.kind === 'wait') return <ActionNotice>{t('workspace.waitNotice', { count: state.limit })}</ActionNotice>
  return null
}
