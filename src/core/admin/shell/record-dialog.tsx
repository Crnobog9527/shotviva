'use client'

import { XIcon } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { Button } from '@/core/ui/button'
import { cn } from '@/core/ui/cn'
import { Dialog, DialogContent } from '@/core/ui/dialog'

import type { ActionResult, ActionValue } from '../templates/types'
import { browserHistory } from '../users-ui/dialog-history'
import { isPlainClick } from '../users-ui/dialog-url'
import { closeRecord, isRecordId, openRecord, withRecord } from './record-dialog-url'

export type RecordLoader<T> = (id: string) => Promise<ActionValue<T | null>>

const COPY = { close: '关闭', loading: '正在读取…', missing: '找不到这条记录，可能已被删除', failed: '读取失败，请稍后重试', retry: '重试' }

// A row's link on a list page: a plain click opens the record's dialog over the list (the list's
// filter and page stay in the address); a new-tab click follows the href to the same dialog.
export function RecordLink({ param, base, id, className, children }: { param: string; base: string; id: string; className?: string; children: ReactNode }) {
  return (
    <a
      href={withRecord(base, param, id)}
      className={cn('text-primary hover:underline', className)}
      onClick={(event) => {
        if (!isPlainClick(event)) return
        event.preventDefault()
        openRecord(browserHistory, param, id)
      }}
    >
      {children}
    </a>
  )
}

// Runs an action and, when it worked, reads the dialog again; the server action has already
// refreshed the list behind it, so the row shows the new state too.
export function reloading<I, R extends ActionResult | ActionValue<unknown>>(action: (input: I) => Promise<R>, reload: () => void) {
  return async (input: I) => {
    const result = await action(input)
    if (result.ok) reload()
    return result
  }
}

type State<T> = { data: T | undefined; missing: boolean; failed: boolean }

// The record, read through a server action when the dialog opens and again after each change.
// What was read stays on screen while the next read runs. The loader sits in a ref: a refresh hands
// the page new action references, which must not trigger another read.
function useRecord<T>(id: string, load: RecordLoader<T>) {
  const loader = useRef(load)
  useEffect(() => {
    loader.current = load
  }, [load])
  const [round, setRound] = useState(0)
  const [state, setState] = useState<State<T>>({ data: undefined, missing: false, failed: false })
  useEffect(() => {
    let live = true
    loader.current(id).then(
      (result) => {
        if (!live) return
        if (!result.ok) setState((current) => ({ ...current, failed: true }))
        else if (result.value === null) setState({ data: undefined, missing: true, failed: false })
        else setState({ data: result.value, missing: false, failed: false })
      },
      () => live && setState((current) => ({ ...current, failed: true })),
    )
    return () => {
      live = false
    }
  }, [id, round])
  const reload = useCallback(() => setRound((value) => value + 1), [])
  return { ...state, reload }
}

type HostProps<T> = { param: string; title: string; load: RecordLoader<T>; children: (data: T, reload: () => void) => ReactNode }

// Mounted on the list page (inside <Suspense>, it reads the search params): ?<param>=<id> shows that
// record in a dialog over the list. Keyed by the id, so another record starts a fresh read.
export function RecordDialogHost<T>({ param, title, load, children }: HostProps<T>) {
  const id = useSearchParams().get(param)
  const close = useCallback(() => closeRecord(browserHistory, param), [param])
  if (!isRecordId(id)) return null
  return <RecordDialog key={id} id={id} title={title} load={load} onClose={close} render={children} />
}

type DialogProps<T> = { id: string; title: string; load: RecordLoader<T>; onClose: () => void; render: (data: T, reload: () => void) => ReactNode }

// A wide panel on a computer, the whole screen on a phone; header fixed, body scrolls. Radix gives
// the focus trap, Esc and the dialog role; the title names it.
function RecordDialog<T>({ id, title, load, onClose, render }: DialogProps<T>) {
  const record = useRecord(id, load)
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className="top-0 left-0 flex h-dvh max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:max-w-none md:top-1/2 md:left-1/2 md:h-[calc(100dvh-48px)] md:w-[min(1040px,calc(100%-48px))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg md:border"
      >
        <header className="flex items-center gap-3 border-b border-border px-4 pt-[max(env(safe-area-inset-top),12px)] pb-3 md:px-6 md:py-4">
          <DialogPrimitive.Title className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Close
            aria-label={COPY.close}
            className="-mr-2 grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <XIcon className="size-5" aria-hidden="true" />
          </DialogPrimitive.Close>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] md:p-6">
          {record.data !== undefined ? render(record.data, record.reload) : <RecordState missing={record.missing} failed={record.failed} onRetry={record.reload} />}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function RecordState({ missing, failed, onRetry }: { missing: boolean; failed: boolean; onRetry: () => void }) {
  if (missing) return <p className="py-12 text-center text-sm text-muted-foreground">{COPY.missing}</p>
  if (failed) {
    return (
      <div role="alert" className="grid justify-items-center gap-3 py-12 text-sm">
        <p className="text-destructive">{COPY.failed}</p>
        <Button size="sm" variant="outline" onClick={onRetry}>
          {COPY.retry}
        </Button>
      </div>
    )
  }
  return (
    <p role="status" className="py-12 text-center text-sm text-muted-foreground">
      {COPY.loading}
    </p>
  )
}
