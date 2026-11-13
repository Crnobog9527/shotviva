'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { ActionBar } from '@/core/app-shell/action-bar'
import type { Balance } from '@/core/billing/pools'
import { useRouter } from '@/core/i18n'
import { navTypesFor } from '@/core/ui/nav-motion'

import type { CatalogueTemplate } from '../../catalogue/catalogue-template'
import { CreateSheet } from '../../workspace/create-sheet'
import { usePosterStudio, type StudioTemplate } from '../use-poster-studio'
import { studioFor, useStudioTemplate } from '../use-studio-template'
import { PosterSample } from './poster-sample'
import { StudioBar, StudioForm } from './poster-studio'

type Context = { balance: Balance; concurrency: number }
type Props = Context & { id: string | null; summary: CatalogueTemplate | null; onClose(): void }

// A poster template's editor as a dialog over Create (ARCHITECTURE §5.3; Owner 2026-11-14: no
// page of its own): from 768px the sample on the left and the editor on the right, below it a
// full-height drawer, like every other template's creation dialog. It opens once the editor's
// view of the template has been read; a template that cannot be read closes the request.
export function PosterDialog({ id, summary, onClose, ...context }: Props) {
  const { ready, failed } = studioFor(useStudioTemplate(id), id)
  // The last template stays mounted while the dialog closes, so its closing motion can play.
  const [shown, setShown] = useState<{ template: StudioTemplate; summary: CatalogueTemplate | null } | null>(null)
  if (ready && shown?.template !== ready) setShown({ template: ready, summary })
  useEffect(() => { if (failed) onClose() }, [failed, onClose])
  if (!shown) return null
  return <PosterSheet key={shown.template.id} {...shown} open={id === shown.template.id} onClose={onClose} {...context} />
}

type SheetProps = Context & { template: StudioTemplate; summary: CatalogueTemplate | null; open: boolean; onClose(): void }

function PosterSheet({ template, summary, open, onClose, balance, concurrency }: SheetProps) {
  const t = useTranslations('app.poster')
  const router = useRouter()
  // Generate queues every poster of the set and moves to Photos, where they develop.
  const studio = usePosterStudio(template, concurrency, () => {
    onClose()
    router.push('/photos', { transitionTypes: navTypesFor('/photos') })
  })
  return (
    <CreateSheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={template.name}
      description={[summary?.categoryName, summary?.description].filter(Boolean).join(' · ')}
      hint={t('dialogHint')}
      tall={false}
      folded={false}
      sample={<PosterSample cover={summary?.cover ?? null} name={template.name} />}
      form={<StudioForm studio={studio} template={template} balance={balance} />}
      bar={<ActionBar inline><StudioBar studio={studio} template={template} balance={balance} /></ActionBar>}
    />
  )
}
