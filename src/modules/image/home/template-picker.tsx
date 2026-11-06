'use client'

import { XIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useState, type ReactNode } from 'react'

import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle } from '@/core/ui/drawer'
import { useMediaQuery } from '@/core/ui/use-media-query'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import type { TemplateSample } from './home-samples'
import { PickerList, PickerSample } from './picker-body'

type Props = {
  // The template the dialog opens on (the bench's choice, or the card's Preview); null: closed.
  openOn: CatalogueTemplate | null
  templates: readonly CatalogueTemplate[]
  onClose(): void
  onPick(id: string): void
  sampleOf(template: CatalogueTemplate): TemplateSample | null
  thumbOf(template: CatalogueTemplate): string | null
}

const closeIcon = (
  <span>
    <XIcon className="size-4" strokeWidth={2.2} aria-hidden />
  </span>
)

// The row chosen inside the dialog; every opening starts on the template it was opened for.
function useChosen(openOn: CatalogueTemplate | null, templates: readonly CatalogueTemplate[]) {
  const [chosenId, setChosenId] = useState<string | null>(null)
  const [openedOn, setOpenedOn] = useState<string | null>(null)
  const opening = openOn?.id ?? null
  if (opening !== openedOn) {
    setOpenedOn(opening)
    setChosenId(opening)
  }
  return { template: templates.find((template) => template.id === chosenId) ?? openOn, choose: setChosenId }
}

// The template picker (v3-b comp `.picker`): from 768 a centred 1040px dialog, sample on the left
// and the grouped list on the right; on phones a bottom drawer. One primary, "Pick ‹name›";
// choosing it sets the generator's template, nothing else (DESIGN §6.9 item 2: no confirm step).
export function TemplatePicker({ openOn, templates, onClose, onPick, sampleOf, thumbOf }: Props) {
  const desktop = useMediaQuery('(min-width: 768px)')
  const t = useTranslations('home.generator')
  const close = useTranslations('app.sheet')('close')
  const selected = useChosen(openOn, templates)
  if (!selected.template) return null
  const chosen = selected.template
  const onOpenChange = (open: boolean) => (open ? undefined : onClose())
  const body = (header: ReactNode) => (
    <div className="mk-pk-body">
      <PickerSample selected={chosen} sampleOf={sampleOf} />
      <div className="mk-pk-side">
        {header}
        <PickerList templates={templates} selected={chosen} onSelect={selected.choose} thumbOf={thumbOf} />
        <div className="mk-pk-go">
          <button type="button" className="mk-cta" onClick={() => onPick(chosen.id)}>
            {t('pickTemplate', { name: chosen.name })}
          </button>
        </div>
      </div>
    </div>
  )
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
