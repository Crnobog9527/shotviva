'use client'

/* eslint-disable @next/next/no-img-element -- a small static brand mark */
import { ArrowUpRight, XIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useReducer, useState } from 'react'

import { cn } from '../../../ui/cn'
import { IntroBody } from './intro-body'
import type { GraylumLinks } from './intro-links'
import { GRAYLUM_ICON, INTRO_SHOTS } from './intro-shots'
import { lightboxReducer } from './lightbox-state'
import { ShotLightbox } from './shot-lightbox'

type Props = { open: boolean; onOpenChange(open: boolean): void; connected: boolean; links: GraylumLinks; disconnect: () => Promise<void> }

// Graylum's introduction, laid out like the Shotviva one inside Graylum: a head that stays put
// (icon, name, close), the words and screenshots scrolling between, one link out in a foot that
// stays put. A centred dialog from 640px; below that a sheet from the bottom edge. The
// lightbox is mounted inside this dialog's content so it is the layer above it: Esc and a
// press outside close the lightbox alone.
export function IntroDialog({ open, onOpenChange, connected, links, disconnect }: Props) {
  const t = useTranslations('partner.intro')
  const [viewing, dispatch] = useReducer(lightboxReducer(INTRO_SHOTS.length), null)
  // The thumbnail that opened the lightbox: focus goes back to it when the lightbox closes.
  const [opener, setOpener] = useState<HTMLElement | null>(null)
  const view = (index: number, from: HTMLElement) => {
    setOpener(from)
    dispatch({ type: 'open', index })
  }
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="scrim-motion fixed inset-0 z-90 bg-[var(--scrim)] backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          data-graylum-intro=""
          className="dialog-motion shadow-sheet fixed inset-x-0 bottom-0 z-100 flex max-h-[calc(100dvh-var(--sat)-12px)] flex-col rounded-t-sheet bg-popover outline-none sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-h-[calc(100dvh-64px)] sm:w-[min(720px,calc(100%-64px))] sm:-translate-1/2 sm:rounded-panel"
        >
          <header className="flex shrink-0 items-center gap-3 py-2 pr-2 pl-5 shadow-[inset_0_-1px_0_var(--border)]">
            <img src={GRAYLUM_ICON.src} alt={t('iconAlt')} width={36} height={36} className="size-9 rounded-[10px]" />
            <DialogPrimitive.Title className="flex-1 text-headline leading-[1.25] font-semibold tracking-[-0.015em]">Graylum</DialogPrimitive.Title>
            <DialogPrimitive.Close aria-label={t('close')} className="grid size-11 place-items-center rounded-full text-bone-dim">
              <span className="grid size-[30px] place-items-center rounded-full bg-wash-strong">
                <XIcon className="size-4" strokeWidth={2.2} aria-hidden="true" />
              </span>
            </DialogPrimitive.Close>
          </header>
          <div data-scrolls="" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-5 pb-6">
            <IntroBody connected={connected} links={links} disconnect={disconnect} onView={view} />
          </div>
          <ViewLink href={links.view} primary={connected} />
          {viewing && <ShotLightbox state={viewing} dispatch={dispatch} opener={opener} />}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

// The one link out, in the foot: Graylum's own site in a new tab (no 去购买). It is the filled
// action once connected; before that 去 Graylum 连接 is, and this one is ghost (One Primary).
export function ViewLink({ href, primary }: { href: string; primary: boolean }) {
  const t = useTranslations('partner.intro')
  return (
    <footer className="flex shrink-0 justify-end px-5 pt-3 pb-[calc(var(--sab)+12px)] shadow-[inset_0_1px_0_var(--border)] sm:pb-3">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'press inline-flex h-12 w-full items-center justify-center gap-1.5 rounded-button px-5 text-[15px] font-semibold sm:w-auto',
          primary ? 'bg-primary text-primary-foreground' : 'bg-wash shadow-[inset_0_0_0_1px_var(--border)]',
        )}
      >
        {t('view')}
        <ArrowUpRight aria-hidden className="size-4" strokeWidth={2.2} />
        <span className="sr-only">{t('newTab')}</span>
      </a>
    </footer>
  )
}
