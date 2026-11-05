import Link from 'next/link'
import type { ReactNode } from 'react'

import { ActionBar, ActionNotice, PAYWALL_HREF } from '@/core/app-shell'
import type { Resolution } from '@/core/templates'
import { buttonVariants } from '@/core/ui/button'

import { creditsLabel } from '../catalogue/catalogue-template'
import type { CtaState } from './cta-state'
import { tierName } from './workspace-options'

const LABELS: Record<'wait' | 'need-photo' | 'uploading' | 'need-copy', string> = {
  wait: 'Wait for a photo to finish',
  'need-photo': 'Add your photo to start',
  uploading: 'Uploading your photo…',
  'need-copy': 'Fill in the text above',
}

// The workspace's bottom bar: one notice line at most, then the one primary (DESIGN §4.3
// steps 4–5). The free-credit notice shows only when this photo would use free credits.
export function FormAction({ state, resolution, onGenerate }: { state: CtaState; resolution: Resolution; onGenerate(): void }) {
  return (
    <ActionBar>
      <Notice state={state} resolution={resolution} />
      {state.kind === 'get-credits' ? (
        <Link href={PAYWALL_HREF} className={buttonVariants({ variant: 'cta-neutral', size: 'cta' })}>
          Get credits{' '}
          <span className="font-medium opacity-[.72]">
            · <span className="font-mono text-caption">{state.needed}</span> needed
          </span>
        </Link>
      ) : state.kind === 'generate' ? (
        <button type="button" onClick={onGenerate} className={buttonVariants({ variant: 'cta', size: 'cta' })}>
          Generate <Cost>· {creditsLabel(state.cost)}</Cost>
        </button>
      ) : (
        <button type="button" disabled className={buttonVariants({ variant: 'glass', size: 'cta', className: 'w-full rounded-tile text-cta text-muted-foreground' })}>
          {LABELS[state.kind]}
        </button>
      )}
    </ActionBar>
  )
}

function Cost({ children }: { children: ReactNode }) {
  return <span className="font-mono text-caption font-medium opacity-[.72]">{children}</span>
}

function Notice({ state, resolution }: { state: CtaState; resolution: Resolution }) {
  if (state.kind === 'generate' && state.pool === 'free') {
    return (
      <ActionNotice>
        This photo uses free credits: it&apos;s shown publicly with a watermark. <b className="font-medium text-foreground">Paid credits make it private and watermark-free.</b>
      </ActionNotice>
    )
  }
  if (state.kind === 'get-credits') {
    return (
      <ActionNotice>
        {tierName(resolution)} needs {creditsLabel(state.cost)}. <b className="font-medium text-foreground">Paid credits make photos private and watermark-free.</b>
      </ActionNotice>
    )
  }
  if (state.kind === 'wait') {
    return <ActionNotice>You can develop {state.limit} photos at a time. The next one starts when one lands in Photos.</ActionNotice>
  }
  return null
}
