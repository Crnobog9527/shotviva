'use client'

import { ChevronLeft, ChevronRight, XIcon } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { Dialog as DialogPrimitive } from 'radix-ui'
import type { KeyboardEvent } from 'react'

import { introScenes } from './intro-shots'
import { canStep, type LightboxAction } from './lightbox-state'
import { LoopVideo } from './loop-video'
import { useSwipeDown } from './use-swipe-down'

type Props = { state: { index: number }; dispatch: (action: LightboxAction) => void; opener: HTMLElement | null }

// A scene's animation large, over the introduction, with its name and line. ← / → (buttons or keys)
// step through all six. It closes by its button, a press on the scrim, Esc, or on a phone by
// dragging the sheet down; only this layer closes, and focus goes back to the tile that
// opened it. The video is asked for only here and is removed on close.
export function ShotLightbox({ state, dispatch, opener }: Props) {
  const t = useTranslations('partner.intro')
  const locale = useLocale()
  const scenes = introScenes(locale)
  const count = scenes.length
  const scene = scenes[state.index]
  const close = () => dispatch({ type: 'close' })
  const swipe = useSwipeDown(close)
  if (!scene) return null
  const step = (by: -1 | 1) => dispatch({ type: 'step', by })
  const keys = (event: KeyboardEvent) => {
    const by = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
    if (!by) return
    event.preventDefault()
    step(by)
  }
  return (
    <DialogPrimitive.Root open onOpenChange={next => (next ? undefined : close())}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="scrim-motion fixed inset-0 z-110 bg-[rgba(5,4,3,0.82)]" />
        <DialogPrimitive.Content
          data-lightbox=""
          aria-roledescription={t('lightbox.label')}
          onKeyDown={keys}
          onCloseAutoFocus={event => {
            event.preventDefault()
            opener?.focus()
          }}
          {...swipe.handlers}
          style={{ transform: swipe.pulled ? `translateY(${swipe.pulled}px)` : undefined }}
          className="dialog-motion fixed inset-x-0 bottom-0 z-120 grid max-h-[calc(100dvh-var(--sat)-12px)] gap-3 rounded-t-sheet bg-popover px-4 pt-6 pb-[calc(var(--sab)+12px)] shadow-sheet outline-none before:absolute before:top-2 before:left-1/2 before:h-[5px] before:w-[38px] before:-translate-x-1/2 before:rounded-full before:bg-wash-strong sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-h-[calc(100dvh-48px)] sm:w-[min(1080px,calc(100vw-48px))] sm:-translate-1/2 sm:rounded-panel sm:px-6 sm:pt-4 sm:pb-4 sm:before:hidden"
        >
          <header className="flex items-start justify-between gap-4">
            <div aria-live="polite" className="min-w-0 pt-1">
              <DialogPrimitive.Title className="text-headline leading-[1.3] font-semibold">{t(`shots.${scene.key}.label`)}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-0.5 text-caption leading-[1.45] text-muted-foreground">{t(`shots.${scene.key}.note`)}</DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close aria-label={t('close')} className="-mt-1 -mr-2 grid size-11 shrink-0 place-items-center rounded-full text-bone-dim">
              <span className="grid size-[30px] place-items-center rounded-full bg-wash-strong">
                <XIcon className="size-4" strokeWidth={2.2} aria-hidden="true" />
              </span>
            </DialogPrimitive.Close>
          </header>
          {/* key: stepping to another scene mounts a fresh video, and the old one is paused and gone */}
          <LoopVideo key={`${locale}-${scene.key}`} media={scene.media} label={t(`shots.${scene.key}.alt`)} className="mx-auto w-[min(100%,calc((100dvh-var(--sat)-200px)*1.6))] sm:w-[min(100%,calc((100dvh-210px)*1.6))]" />
          <nav aria-label={t('lightbox.label')} className="flex items-center justify-center gap-3 text-caption text-muted-foreground tabular-nums">
            <StepButton label={t('lightbox.prev')} disabled={!canStep(state, -1, count)} onClick={() => step(-1)}><ChevronLeft className="size-5" aria-hidden /></StepButton>
            <span className="min-w-12 text-center">{t('lightbox.count', { n: state.index + 1, total: count })}</span>
            <StepButton label={t('lightbox.next')} disabled={!canStep(state, 1, count)} onClick={() => step(1)}><ChevronRight className="size-5" aria-hidden /></StepButton>
          </nav>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function StepButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick(): void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="press grid size-11 place-items-center rounded-full bg-wash text-foreground shadow-[inset_0_0_0_1px_var(--border)] disabled:opacity-40">
      {children}
    </button>
  )
}
