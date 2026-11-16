'use client'

import { XIcon } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useMemo, useState, type ReactNode } from 'react'

import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle } from '@/core/ui/drawer'
import { useMediaQuery } from '@/core/ui/use-media-query'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { browseView } from '../catalogue/picker-browse'
import type { HomeCatalogue } from './home-catalogue'
import type { TemplateSample } from './home-samples'
import { PickerSample } from './picker-body'
import { PickerBrowser } from './picker-list'

type Props = {
  // The template the dialog opens on (the bench's choice, or the card's Preview); null: closed.
  openOn: string | null
  catalogue: HomeCatalogue | null
  failed: boolean
  onRetry(): void
  onClose(): void
  onPick(template: CatalogueTemplate): void
  sampleOf(template: CatalogueTemplate): TemplateSample | null
  thumbOf(template: CatalogueTemplate): string | null
}

const closeIcon = (
  <span>
    <XIcon className="size-4" strokeWidth={2.2} aria-hidden />
  </span>
)

// The row chosen inside the dialog; every opening starts on the template it was opened for.
function useChosen(openOn: string | null, templates: readonly CatalogueTemplate[]) {
  const [chosenId, setChosenId] = useState<string | null>(null)
  const [openedOn, setOpenedOn] = useState<string | null>(null)
  if (openOn !== openedOn) {
    setOpenedOn(openOn)
    setChosenId(openOn)
  }
  return { template: templates.find((template) => template.id === chosenId) ?? null, choose: setChosenId }
}

type BodyProps = { header: ReactNode; chosen: CatalogueTemplate; choose(id: string): void } & Pick<Props, 'onPick' | 'sampleOf' | 'thumbOf'> & {
  view: ReturnType<typeof browseView>
}

// Mounted only while the picker is open, so every opening starts on All with an empty search.
function PickerBody({ header, chosen, choose, view, onPick, sampleOf, thumbOf }: BodyProps) {
  const t = useTranslations('home.generator')
  const [searching, setSearching] = useState(false)
  return (
    <div className="mk-pk-body" data-searching={searching || undefined}>
      <PickerSample selected={chosen} sampleOf={sampleOf} />
      <div className="mk-pk-side">
        {header}
        <PickerBrowser view={view} selected={chosen} onSelect={choose} thumbOf={thumbOf} onSearching={setSearching} />
        <div className="mk-pk-go">
          <button type="button" className="mk-cta" onClick={() => onPick(chosen)}>
            {t('pickTemplate', { name: chosen.name })}
          </button>
        </div>
      </div>
    </div>
  )
}

function PickerPending({ header, failed, onRetry }: Pick<Props, 'failed' | 'onRetry'> & { header: ReactNode }) {
  const t = useTranslations('home.generator')
  const retry = useTranslations('pageError')('retry')
  return (
    <div className="mk-pk-side">
      {header}
      <p className="mk-pk-none" role={failed ? 'alert' : 'status'}>{t(failed ? 'pickerLoadFailed' : 'pickerLoading')}</p>
      {failed ? <button type="button" className="mk-ghost-pill" onClick={onRetry}>{retry}</button> : null}
    </div>
  )
}

const EMPTY: readonly CatalogueTemplate[] = []

// The template picker (v3-b comp `.picker`): from 768 a centred 1040px dialog, sample on the left
// and, on the right, search, category chips and the list (series as one row each, Owner
// 2026-11-13); on phones a bottom drawer. One primary, "Pick ‹name›"; choosing it sets the
// generator's template, nothing else (DESIGN §6.9 item 2: no confirm step).
export function TemplatePicker({ openOn, catalogue, failed, onRetry, onClose, onPick, sampleOf, thumbOf }: Props) {
  const desktop = useMediaQuery('(min-width: 768px)')
  const t = useTranslations('home.generator')
  const close = useTranslations('app.sheet')('close')
  const zh = useLocale() === 'zh'
  const templates = catalogue?.templates ?? EMPTY
  const browse = catalogue?.browse ?? null
  const ready = catalogue !== null
  const view = useMemo(() => openOn && ready ? browseView(browse, templates, zh) : null, [openOn, ready, browse, templates, zh])
  const { template: chosen, choose } = useChosen(openOn, templates)
  if (!openOn || (view && !chosen)) return null
  const onOpenChange = (open: boolean) => (open ? undefined : onClose())
  const body = (header: ReactNode) => view && chosen
    ? <PickerBody header={header} chosen={chosen} choose={choose} view={view} onPick={onPick} sampleOf={sampleOf} thumbOf={thumbOf} />
    : <PickerPending header={header} failed={failed} onRetry={onRetry} />
  if (desktop) {
    return (
      <DialogPrimitive.Root open onOpenChange={onOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-90 bg-[var(--scrim)] backdrop-blur-[2px]" />
          <DialogPrimitive.Content className="mk-picker shadow-sheet fixed top-1/2 left-1/2 z-100 w-[min(1040px,calc(100%-48px))] -translate-1/2 rounded-panel bg-popover outline-none">
            {body(
              <>
                <DialogPrimitive.Title className="mk-pk-title">{t('pickerTitle')}</DialogPrimitive.Title>
                <DialogPrimitive.Description className="mk-pk-text">{t('pickerText')}</DialogPrimitive.Description>
              </>,
            )}
            <DialogPrimitive.Close className="mk-sheet-x" aria-label={close}>
              {closeIcon}
            </DialogPrimitive.Close>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    )
  }
  return (
    <Drawer open onOpenChange={onOpenChange}>
      <DrawerContent className="mk-picker">
        <div className="mk-pk-scroll">
          {body(
            <>
              <DrawerTitle className="mk-pk-title">{t('pickerTitle')}</DrawerTitle>
              <DrawerDescription className="mk-pk-text">{t('pickerText')}</DrawerDescription>
            </>,
          )}
        </div>
        <DrawerClose className="mk-sheet-x" aria-label={close}>
          {closeIcon}
        </DrawerClose>
      </DrawerContent>
    </Drawer>
  )
}
