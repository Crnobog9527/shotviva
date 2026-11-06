'use client'

import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { PaywallButton } from '@/core/billing/paywall'
import { Link } from '@/core/i18n/ui'
import { cn } from '@/core/ui/cn'

import type { HomeCta } from './home-cta'
import { CameraIcon } from './home-icons'

type Props = {
  cta: HomeCta
  templateId: string | null
  // 'card' (phone, tablet): without a photo the button says "Upload photo"; 'bench' keeps
  // "Generate · 2 credits" and opens the photo picker (v3-b comp).
  place: 'card' | 'bench'
  onPickPhoto(): void
  onSignUp(): void
  onGenerate(): void
}

const costTag = (chunks: ReactNode) => <span className="mk-cost-tag">{chunks}</span>
const mono = (chunks: ReactNode) => <span className="font-mono">{chunks}</span>

const PRIMARY = 'mk-cta'

// The generator's one primary (DESIGN §6.9 item 9), with the workspace's own labels:
// "Generate · 2 credits", "Get credits · N needed" (neutral, opens the paywall), or a disabled
// state while the photo uploads or a slot is busy.
export function HomeCtaButton({ cta, templateId, place, onPickPhoto, onSignUp, onGenerate }: Props) {
  const t = useTranslations('app.workspace')
  const home = useTranslations('home.generator')
  const generate = (count: number) => t.rich('generateCta', { cost: costTag, count })
  switch (cta.kind) {
    case 'pick-photo':
      return (
        <button type="button" className={PRIMARY} onClick={onPickPhoto}>
          <CameraIcon />
          <span>{place === 'card' ? home('uploadPhoto') : generate(cta.cost)}</span>
        </button>
      )
    case 'sign-up':
      return (
        <button type="button" className={PRIMARY} onClick={onSignUp}>
          <CameraIcon />
          <span>{generate(cta.cost)}</span>
        </button>
      )
    case 'generate':
      return (
        <button type="button" className={PRIMARY} onClick={onGenerate}>
          <CameraIcon />
          <span>{generate(cta.cost)}</span>
        </button>
      )
    case 'get-credits':
      return (
        <PaywallButton trigger="insufficient_credits" className={cn(PRIMARY, 'mk-cta-neutral')}>
          <span>{t.rich('getCreditsCta', { cost: costTag, mono, count: cta.needed })}</span>
        </PaywallButton>
      )
    case 'needs-copy':
      return templateId ? (
        <Link href={`/generate/${templateId}`} className={PRIMARY}>
          {home('needsCopy')}
        </Link>
      ) : null
    default:
      return (
        <button type="button" className={cn(PRIMARY, 'mk-cta-idle')} disabled>
          {cta.kind === 'wait' ? t('wait') : cta.kind === 'uploading' ? t('uploadingCta') : home('noTemplates')}
        </button>
      )
  }
}
