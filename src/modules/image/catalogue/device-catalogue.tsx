'use client'

import { useLocale, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { Button } from '@/core/ui/button'

import type { CreateContext } from '../workspace/create-dialog'
import type { CataloguePayload } from './catalogue-payload'
import { TemplateCatalogue } from './template-catalogue'
import { useDeviceCatalogue } from './use-device-catalogue'
import { useSettled } from './use-settled'

type Props = {
  // The account's create context, streamed by the page after the grid.
  create: Promise<CreateContext>
  // An entitlement-specific catalogue (the poster templates behind a tier gate), streamed by the
  // page for an account that has it; null for everyone else, who use the public file.
  entitled: Promise<CataloguePayload | null>
  endCard?: ReactNode
}

// Create's grid from the copy on the device (use-device-catalogue.ts): drawn on the tap, not after
// a request to the server. The page's HTML carries no catalogue.
export function DeviceCatalogue({ create, entitled, endCard }: Props) {
  const locale = useLocale()
  const device = useDeviceCatalogue(locale)
  const payload = useSettled(entitled) ?? device.payload
  if (payload) return <TemplateCatalogue payload={payload} create={create} endCard={endCard} />
  if (device.failed) return <CatalogueFailed onRetry={device.retry} />
  return <CatalogueSkeleton />
}

function CatalogueFailed({ onRetry }: { onRetry(): void }) {
  const t = useTranslations('app.create')
  return (
    <div className="flex items-center gap-3 px-(--gutter) pt-6">
      <p className="text-body text-muted-foreground">{t('catalogueLoadFailed')}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>{t('formRetry')}</Button>
    </div>
  )
}

// The first visit only (nothing on the device yet): the search bar's and two cards' places.
function CatalogueSkeleton() {
  return (
    <div aria-hidden="true" className="px-(--gutter) pt-4">
      <div className="mb-4 h-11 rounded-full bg-wash md:max-w-[420px]" />
      <div className="grid grid-cols-1 gap-x-3 gap-y-6 md:grid-cols-2 md:gap-x-4 lg:grid-cols-3">
        {[0, 1].map((key) => <div key={key} className="aspect-[4/3] rounded-tile bg-wash" />)}
      </div>
    </div>
  )
}
