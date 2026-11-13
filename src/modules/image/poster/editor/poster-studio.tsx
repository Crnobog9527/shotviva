'use client'

import { useTranslations } from 'next-intl'

import type { Balance } from '@/core/billing/pools'
import { useRouter } from '@/core/i18n'
import type { PosterBlock } from '@/core/poster'
import { Button } from '@/core/ui/button'

import { usePosterStudio, type StudioTemplate } from '../use-poster-studio'
import { BlockTabs } from './block-tabs'
import { GeneratePanel } from './generate-panel'
import { PasteStep } from './paste-step'

type Props = { template: StudioTemplate; balance: Balance; concurrency: number }

// The dense-text poster editor (ARCHITECTURE §5.3, DESIGN mobile 375 first): paste → check the
// sorted blocks → make every poster of the set. The finished posters develop in Photos.
export function PosterStudio({ template, balance, concurrency }: Props) {
  const t = useTranslations('app.poster')
  const router = useRouter()
  const studio = usePosterStudio(template, concurrency, () => router.push('/photos'))
  const blocks = blocksOf(template)
  if (studio.draft.step === 'paste') return <div className="px-(--gutter) pt-2"><PasteStep studio={studio} /></div>
  return (
    <div className="grid gap-6 px-(--gutter) pt-2">
      {studio.notice === 'sortFailed' ? <p className="rounded-control bg-wash-faint p-3 text-caption">{t('notice.sortFailed')}</p> : null}
      {studio.draft.source ? (
        <details className="rounded-control bg-wash-faint p-3 text-caption">
          <summary className="min-h-11 cursor-pointer content-center font-medium">{t('sourceText')}</summary>
          <p className="whitespace-pre-wrap text-muted-foreground">{studio.draft.source}</p>
        </details>
      ) : null}
      <BlockTabs blocks={blocks} unverified={studio.draft.unverified} content={studio.draft.content}
        flagged={(path) => studio.draft.unverified.includes(path)} onChange={studio.edit} />
      <GeneratePanel studio={studio} template={template} balance={balance} />
      <Button variant="ghost" className="min-h-11" onClick={studio.toPaste}>{t('backToPaste')}</Button>
    </div>
  )
}

// The template's blocks in a fixed reading order, each once.
function blocksOf(template: StudioTemplate): PosterBlock[] {
  const used = new Set(template.poster.kinds.flatMap((kind) => kind.blocks))
  return (['header', 'prizes', 'sections', 'table', 'footer'] as const).filter((block) => used.has(block))
}

