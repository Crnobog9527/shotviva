'use client'

import { useTranslations } from 'next-intl'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'

import type { Balance } from '@/core/billing/pools'
import type { MembershipTier } from '@/core/config'
import { cn } from '@/core/ui/cn'
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle } from '@/core/ui/drawer'
import { useMediaQuery } from '@/core/ui/use-media-query'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { batchCaps, type BatchCaps } from '../gated/feature-access'
import { GuideButton } from '../gated/guide-button'
import { CloseButton } from '../workspace/create-sheet'
import { keepBatchTemplates } from './batch-query'
import { MatrixAction } from './matrix-action'
import { MatrixForm, MatrixStage, useBatchLede } from './matrix-form'
import { MatrixResults } from './matrix-results'
import { withTemplates } from './matrix-state'
import { useBatchSession, type BatchSession } from './use-batch-session'

export type BatchDialogProps = {
  open: boolean
  onClose(): void
  // ?t= when it was opened: the templates it opens on (none: keep the draft's).
  requested: string[]
  templates: readonly CatalogueTemplate[]
  balance: Balance
  tier: MembershipTier | null
  limit: number
}

// Batch create as a dialog on Create (Owner 2026-11-12): the same form as the /generate/batch
// page (templates, photos, the grid, options, one Generate), then its results and ZIP, in a large
// centred dialog from 768px and a full-height drawer below. "See how it works" sits in its head.
// It stays mounted once opened, so closing keeps the draft (photos included) for the next opening
// on this page; the batch's jobs live in the generation store either way.
export function BatchDialog(props: BatchDialogProps) {
  const caps = batchCaps(props.tier)
  return caps ? <BatchDialogBody {...props} caps={caps} /> : null
}

function BatchDialogBody({ open, onClose, requested, templates, balance, tier, limit, caps }: BatchDialogProps & { caps: BatchCaps }) {
  const t = useTranslations('app.matrix')
  const scroller = useRef<HTMLDivElement>(null)
  const session = useBatchSession({ templates, initial: requested, balance, limit, caps, onStarted: () => scroller.current?.scrollTo({ top: 0 }) })
  useOpening(open, requested, session, caps)
  useKeepTemplates(open, session.draft.values.templateIds)
  const results = session.ids.length > 0
  const frame = {
    open,
    onClose,
    title: t('title'),
    lede: useBatchLede(caps),
    guide: <GuideButton tier={tier} variant="pill" />,
    scroller,
  }
  if (results) {
    return (
      <BatchFrame {...frame}>
        <MatrixResults ids={session.ids} onRetry={session.retry} onNew={session.newBatch} onApply={session.applyMore} onClose={onClose} />
      </BatchFrame>
    )
  }
  const { draft, refusal } = session
  return (
    <BatchFrame
      {...frame}
      bar={<MatrixAction inline cta={draft.cta} max={caps.cells} error={refusal.message(draft.error)} onGenerate={session.generate} />}
      stage={<MatrixStage draft={draft} className="block" />}
    >
      <MatrixForm draft={draft} templates={templates} balancePaid={balance.paid} tier={tier} />
    </BatchFrame>
  )
}

// Opened again with ?t= (a template's "Use Batch create"): those templates replace the choice,
// photos and the kept templates' text stay. Opened without (the Create card): the draft as left.
function useOpening(open: boolean, requested: string[], session: BatchSession, caps: BatchCaps) {
  const [seen, setSeen] = useState(open)
  if (open !== seen) {
    setSeen(open)
    const current = session.draft.values.templateIds
    if (open && requested.length && requested.join(',') !== current.join(',')) {
      session.draft.setValues((values) => withTemplates(values, requested, caps.templates))
    }
  }
}

// While open, the chosen templates ride in the address (?t=), so a refresh reopens with them.
function useKeepTemplates(open: boolean, templateIds: readonly string[]) {
  const key = templateIds.join(',')
  useEffect(() => {
    if (open) keepBatchTemplates(key ? key.split(',') : [])
  }, [open, key])
}

type FrameProps = {
  open: boolean
  onClose(): void
  title: string
  lede: string
  guide: ReactNode
  scroller: RefObject<HTMLDivElement | null>
  // The form's grid, beside it from lg; results come without one and take the whole width.
  stage?: ReactNode
  bar?: ReactNode
  children: ReactNode
}

function BatchFrame(props: FrameProps) {
  const desktop = useMediaQuery('(min-width: 768px)')
  return desktop ? <DesktopFrame {...props} /> : <PhoneFrame {...props} />
}

// From 768px: a large centred dialog. The head (title, line, See how it works, close) stays put;
// below it the form scrolls over its pinned Generate, and from lg the grid has its own column.
function DesktopFrame({ open, onClose, title, lede, guide, scroller, stage, bar, children }: FrameProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="scrim-motion fixed inset-0 z-90 bg-[var(--scrim)] backdrop-blur-[2px]" />
        <DialogPrimitive.Content className="dialog-motion shadow-sheet fixed top-1/2 left-1/2 z-100 flex h-[min(calc(100dvh-64px),900px)] w-[min(1120px,calc(100%-32px))] -translate-1/2 flex-col overflow-hidden rounded-panel bg-popover outline-none">
          <div className="flex flex-none items-center gap-4 py-4 pr-16 pl-6 shadow-[inset_0_-1px_0_var(--border)]">
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="font-display text-h1 leading-[1.05] tracking-[-0.02em]">{title}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-caption text-pretty text-muted-foreground">{lede}</DialogPrimitive.Description>
            </div>
            {guide}
          </div>
          <div className={cn('grid min-h-0 flex-1', stage && 'lg:grid-cols-[minmax(400px,480px)_minmax(0,1fr)]')}>
            <div className="flex min-h-0 flex-col">
              <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-4 [&>section:first-child]:pt-4">
                {children}
              </div>
              {bar}
            </div>
            {stage ? <div className="hidden min-h-0 overflow-y-auto overscroll-contain px-6 pt-4 pb-6 shadow-[inset_1px_0_0_var(--border)] lg:block">{stage}</div> : null}
          </div>
          <CloseButton Close={DialogPrimitive.Close} className="top-4 right-4" />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

// Below 768px: a full-height drawer like a template's dialog. Title, line and See how it works
// scroll with the form as one surface (inside the drawer only a scroller may pan), over the
// pinned Generate.
function PhoneFrame({ open, onClose, title, lede, guide, scroller, bar, children }: FrameProps) {
  return (
    <Drawer open={open} onOpenChange={(next) => !next && onClose()}>
      <DrawerContent className="h-[calc(100dvh-var(--sat)-12px)]">
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          <DrawerTitle className="mr-12">{title}</DrawerTitle>
          <DrawerDescription className="mt-1 text-pretty">{lede}</DrawerDescription>
          <div className="mt-3">{guide}</div>
          <div className="[&>section:first-child]:pt-5">{children}</div>
        </div>
        {bar}
        <CloseButton Close={DrawerClose} className="top-3 right-3" />
      </DrawerContent>
    </Drawer>
  )
}
