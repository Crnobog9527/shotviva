'use client'

import { PencilIcon, PlusIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { NOTE_MAX_LENGTH } from '@/core/templates/output-options'

import type { MatrixCell } from './matrix-state'
import type { ReviewActions } from './review-actions'

// A result's own note (补充说明), under its row (Owner 2026-11-28). At rest: a two-line prompt
// with an example, or the note itself; tapped: edited in place, with shortcuts that copy it to
// the template's or the photo's other results. Never called a prompt (DESIGN §4.3).
export function RowNote({ cell, actions }: { cell: MatrixCell; actions: ReviewActions }) {
  const t = useTranslations('app.matrix.review')
  if (actions.editing === cell.key) return <NoteEditor cell={cell} actions={actions} />
  const open = () => actions.setEditing(cell.key)
  if (cell.note.trim()) {
    return (
      <button type="button" onClick={open} aria-label={t('noteEdit')} className="press hairline flex w-full items-start gap-2.5 rounded-[14px] bg-wash-faint px-3 py-2 text-left text-label leading-[1.45]">
        <span aria-hidden="true" className="mt-2 size-[7px] flex-none rounded-full bg-foreground" />
        <span className="line-clamp-2 min-w-0 flex-1 break-words whitespace-pre-line">{cell.note}</span>
        <PencilIcon aria-hidden="true" className="mt-1 size-4 flex-none text-muted-foreground" />
      </button>
    )
  }
  return (
    <button type="button" onClick={open} className="press flex w-full items-start gap-2.5 rounded-[14px] px-3 py-2 text-left text-muted-foreground shadow-[inset_0_0_0_1px_var(--hairline)] hover:text-foreground">
      <PlusIcon aria-hidden="true" className="mt-0.5 size-4 flex-none" />
      <span className="min-w-0">
        <span className="block text-label leading-[1.4] font-medium text-bone-dim">{t('noteLabel')}</span>
        <span className="block text-caption leading-[1.4] max-md:hidden">{t('noteHint')}</span>
        <span className="block text-caption leading-[1.4] md:hidden">{t('noteHintShort')}</span>
      </span>
    </button>
  )
}

function NoteEditor({ cell, actions }: { cell: MatrixCell; actions: ReviewActions }) {
  const t = useTranslations('app.matrix.review')
  const id = `note-${cell.key}`
  const { template, photo } = actions.siblings(cell.key)
  const others = { template: template.filter((key) => key !== cell.key), photo: photo.filter((key) => key !== cell.key) }
  const done = () => actions.setEditing(null)
  return (
    <div className="rounded-[16px] bg-wash-faint px-3.5 py-3 shadow-[inset_0_0_0_1.5px_var(--primary),0_0_0_4px_var(--safelight-halo)]">
      <label htmlFor={id} className="mb-1 block text-caption font-medium text-bone-dim">{t('noteLabel')}</label>
      <textarea
        id={id}
        rows={2}
        autoFocus
        maxLength={NOTE_MAX_LENGTH}
        value={cell.note}
        placeholder={t('notePlaceholder')}
        onChange={(event) => actions.setNote(cell.key, event.target.value)}
        onKeyDown={(event) => event.key === 'Escape' && (event.stopPropagation(), done())}
        enterKeyHint="done"
        className="block min-h-12 w-full resize-none bg-transparent text-body leading-[1.5] outline-none placeholder:text-muted-foreground"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        {cell.note.trim() && (others.template.length > 0 || others.photo.length > 0) ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-caption text-muted-foreground">{t('noteAlso')}</span>
            {others.template.length > 0 ? <AlsoButton label={t('noteAlsoTemplate', { count: template.length })} onClick={() => actions.copyNote(cell.key, others.template)} /> : null}
            {others.photo.length > 0 ? <AlsoButton label={t('noteAlsoPhoto', { count: photo.length })} onClick={() => actions.copyNote(cell.key, others.photo)} /> : null}
          </div>
        ) : <span />}
        <span className="flex items-center gap-2.5">
          <span className="font-mono text-caption text-muted-foreground">{cell.note.length} / {NOTE_MAX_LENGTH}</span>
          <button type="button" onClick={done} className="press h-9 rounded-full bg-foreground px-4 text-caption font-semibold text-background">{t('noteDone')}</button>
        </span>
      </div>
    </div>
  )
}

function AlsoButton({ label, onClick }: { label: string; onClick(): void }) {
  return (
    <button type="button" onClick={onClick} className="press hairline h-8 rounded-full bg-wash px-3 text-caption font-medium text-bone-dim hover:text-foreground">
      {label}
    </button>
  )
}
