'use client'

import { Pencil } from 'lucide-react'

import { Button } from '@/core/ui/button'

import { LOCALE_DISPLAY_COPY as COPY } from './copy'
import type { LocaleDisplayEditor } from './use-locale-display-editor'

// 编辑 above the read view; while editing, a bar after the lists that stays at the bottom of the
// screen with what is unsaved, 取消 and 保存, so a long list never hides the buttons.
export function EditBar({ editor, label }: { editor: LocaleDisplayEditor; label: string }) {
  const { status } = editor
  const message = status ? (
    <p role={status.kind === 'error' ? 'alert' : 'status'} className={status.kind === 'error' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
      {status.text}
    </p>
  ) : null
  if (!editor.editing) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="outline" onClick={editor.startEdit}><Pencil aria-hidden />{COPY.edit}</Button>
        {message}
      </div>
    )
  }
  return (
    <div className="sticky bottom-3 z-10 grid gap-2 rounded-lg border bg-muted px-4 py-2 shadow-lg">
      <div className="flex flex-wrap items-center gap-3">
        <span className="min-w-0 flex-1 text-sm">
          {COPY.editing(label)}
          <span className={editor.dirty ? ' font-medium text-primary' : ' text-muted-foreground'}> {editor.dirty ? COPY.dirty : COPY.clean}</span>
        </span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="ghost" disabled={editor.saving} onClick={editor.cancel}>{COPY.cancel}</Button>
          <Button size="sm" disabled={editor.saving} onClick={editor.save}>{editor.saving ? COPY.saving : COPY.save}</Button>
        </div>
      </div>
      {message}
    </div>
  )
}
