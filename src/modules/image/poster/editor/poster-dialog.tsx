'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { ActionBar } from '@/core/app-shell/action-bar'
import type { Balance } from '@/core/billing/pools'
import { useRouter } from '@/core/i18n'
import { navTypesFor } from '@/core/ui/nav-motion'

import type { CatalogueTemplate } from '../../catalogue/catalogue-template'
import type { PosterSeries } from '../../catalogue/poster-series'
import { MemberPicker } from '../../workspace/member-picker'
import { CreateSheet } from '../../workspace/create-sheet'
import { carryDraft, usePosterStudio, type StudioTemplate } from '../use-poster-studio'
import { usePhotoSort } from '../use-photo-sort'
import { usePosterWeekly } from '../use-poster-weekly'
import { studioFor, useStudioTemplate } from '../use-studio-template'
import { PosterSample } from './poster-sample'
import { StudioBar, StudioForm } from './poster-studio'

type Context = { balance: Balance; concurrency: number }
type Switcher = { series: PosterSeries | null; onSwitch(id: string): void }
type Props = Context & Switcher & { id: string | null; summary: CatalogueTemplate | null; onClose(): void }

// A poster template's editor as a dialog over Create (ARCHITECTURE §5.3; Owner 2026-11-14: no
// page of its own): from 768px the sample on the left and the editor on the right, below it a
// full-height drawer, like every other template's creation dialog. It opens once the editor's
// view of the template has been read; a template that cannot be read closes the request.
export function PosterDialog({ id, summary, series, onSwitch, onClose, ...context }: Props) {
  const { ready, failed } = studioFor(useStudioTemplate(id), id)
  // The last template stays mounted while the dialog closes, so its closing motion can play.
  const [shown, setShown] = useState<{ template: StudioTemplate; summary: CatalogueTemplate | null } | null>(null)
  if (ready && shown?.template !== ready) setShown({ template: ready, summary })
  useEffect(() => { if (failed) onClose() }, [failed, onClose])
  if (!shown) return null
  // Switching style keeps the dialog open while the next template loads.
  const open = id === shown.template.id || (id !== null && series !== null && series.members.some((member) => member.id === id))
  return <PosterSheet key={shown.template.id} {...shown} open={open} series={series} onSwitch={onSwitch} onClose={onClose} {...context} />
}

type SheetProps = Context & Switcher & { template: StudioTemplate; summary: CatalogueTemplate | null; open: boolean; onClose(): void }

function PosterSheet({ template, summary, open, series, onSwitch, onClose, balance, concurrency }: SheetProps) {
  const t = useTranslations('app.poster')
  const tApp = useTranslations('app')
  const router = useRouter()
  // Generate queues every poster of the set and moves to Photos, where they develop.
  const studio = usePosterStudio(template, concurrency, () => {
    onClose()
    router.push('/photos', { transitionTypes: navTypesFor('/photos') })
  })
  // 用上一期 reads this style and the series' others; their names say where it came from.
  const members = series?.members ?? []
  const weekly = usePosterWeekly(template, studio, members.map((member) => member.id).filter((id) => id !== template.id))
  const names = { ...Object.fromEntries(members.map((member) => [member.id, member.name])), [template.id]: template.name }
  const photo = usePhotoSort(template, studio, weekly.dirty)
  return (
    <CreateSheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={template.name}
      description={[summary?.categoryName, summary?.description].filter(Boolean).join(' · ')}
      hint={t('dialogHint')}
      tall={false}
      folded={false}
      picker={series ? (
        <MemberPicker label={tApp('series.members', { name: series.name, count: series.members.length })} members={series.members} value={template.id}
          onChange={(next) => { carryDraft(template.id, next); onSwitch(next) }} />
      ) : undefined}
      sample={<PosterSample cover={summary?.cover ?? null} name={template.name} />}
      form={<StudioForm studio={studio} template={template} balance={balance} reuse={{ weekly, names, photo }} />}
      bar={<ActionBar inline><StudioBar studio={studio} template={template} balance={balance} /></ActionBar>}
    />
  )
}
