'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef, type ReactNode } from 'react'

import { Link } from '@/core/i18n/ui'
import { UPLOAD_ACCEPT } from '@/core/storage/rules'
import { cn } from '@/core/ui/cn'

import type { HomeCta } from './home-cta'
import { CameraIcon } from './home-icons'

type Props = {
  cta: HomeCta
  templateId: string | null
  onPhotoPicked(file: File): void
  onSignUp(): void
  onGenerate(): void
}

const costTag = (chunks: ReactNode) => <span className="mk-cost-tag">{chunks}</span>
const mono = (chunks: ReactNode) => <span className="font-mono">{chunks}</span>

const PRIMARY = 'mk-cta'

// The generator's one primary (DESIGN §6.9 item 9), with the workspace's own labels:
// "Generate · 2 credits", "Get credits · N needed" (neutral, opens the paywall), or a disabled
// state while the photo uploads or a slot is busy.
export function HomeCtaButton({ cta, templateId, onPhotoPicked, onSignUp, onGenerate }: Props) {
  const t = useTranslations('app.workspace')
  const home = useTranslations('home.generator')
  const initialInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const input = initialInput.current
    const file = input?.files?.[0]
    if (!file || !input) return
    onPhotoPicked(file)
    input.value = ''
  }, [onPhotoPicked])
  const generate = (count: number) => t.rich('generateCta', { cost: costTag, count })
  switch (cta.kind) {
    case 'pick-photo':
      return (
        <label className={cn(PRIMARY, 'mk-upload-cta')}>
          {/* The native label opens the picker on touch; the input handles Tab, Enter and Space. */}
          <input
            ref={initialInput}
            type="file"
            accept={UPLOAD_ACCEPT}
            className="sr-only"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              if (file) onPhotoPicked(file)
              event.currentTarget.value = ''
            }}
          />
          <CameraIcon />
          <span>{home('uploadPhoto')}</span>
        </label>
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
        <button type="button" onClick={() => window.dispatchEvent(new Event('shotviva:home-paywall'))} className={cn(PRIMARY, 'mk-cta-neutral')}>
          <span>{t.rich('getCreditsCta', { cost: costTag, mono, count: cta.needed })}</span>
        </button>
      )
    case 'needs-copy':
      return templateId ? (
        <Link href={`/generate/${templateId}`} className={PRIMARY}>
          {home('needsCopy')}
        </Link>
      ) : null
    default:
      return <DisabledCta kind={cta.kind} />
  }
}

function DisabledCta({ kind }: { kind: HomeCta['kind'] }) {
  const t = useTranslations('app.workspace')
  const home = useTranslations('home.generator')
  const labels = { wait: 'wait', uploading: 'uploadingCta', 'need-size': 'pickSize', 'no-options': 'noOptions' } as const
  const key = labels[kind as keyof typeof labels]
  return <button type="button" className={cn(PRIMARY, 'mk-cta-idle')} disabled>{key ? t(key) : home('noTemplates')}</button>
}
