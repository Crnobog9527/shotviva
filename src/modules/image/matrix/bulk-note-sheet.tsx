'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { NOTE_MAX_LENGTH } from '@/core/templates/output-options'
import { buttonVariants } from '@/core/ui/button'
import { cn } from '@/core/ui/cn'
import { ResponsiveSheet } from '@/core/ui/responsive-sheet'

import { cleanNote, type NoteMode } from './cell-choices'
import type { MatrixCell } from './matrix-state'

type Props = { cells: readonly MatrixCell[]; onClose(): void; onApply(note: string, mode: NoteMode): void }

// One note for every picked result (Owner 2026-11-28). When some already carry their own, the
// user says whether the new words go after them (the default: nothing written is lost) or
// replace them. Each result can still be edited on its own afterwards.
export function BulkNoteSheet({ cells, onClose, onApply }: Props) {
  const t = useTranslations('app.matrix.review')
  const [note, setNote] = useState('')
  const [mode, setMode] = useState<NoteMode>('append')
  const has = cells.filter((cell) => cell.note.trim()).length
  const apply = () => {
    onApply(note, mode)
    onClose()
  }
  return (
    <ResponsiveSheet open onOpenChange={(open) => !open && onClose()} title={t('bulkNoteTitle', { count: cells.length })} description={t('bulkNoteLine')} nested>
      <div className="mt-4 rounded-[16px] bg-wash-faint p-3.5 shadow-[inset_0_0_0_1px_var(--input)] focus-within:shadow-[inset_0_0_0_1.5px_var(--primary),0_0_0_4px_var(--safelight-halo)]">
        <textarea
          aria-label={t('noteLabel')}
          rows={3}
          autoFocus
          maxLength={NOTE_MAX_LENGTH}
          value={note}
          placeholder={t('notePlaceholder')}
          onChange={(event) => setNote(event.target.value)}
          className="block min-h-[76px] w-full resize-none bg-transparent text-body leading-[1.5] outline-none placeholder:text-muted-foreground"
        />
        <p className="text-right font-mono text-caption text-muted-foreground">{note.length} / {NOTE_MAX_LENGTH}</p>
      </div>
      {has > 0 ? (
        <fieldset className="mt-4">
          <legend className="text-caption text-bone-dim">{t('bulkNoteHas', { count: has })}</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <ModeOption on={mode === 'append'} onClick={() => setMode('append')} title={t('modeAppend')} line={t('modeAppendLine')} />
            <ModeOption on={mode === 'replace'} onClick={() => setMode('replace')} title={t('modeReplace')} line={t('modeReplaceLine')} />
          </div>
        </fieldset>
      ) : null}
      <button type="button" disabled={!cleanNote(note)} onClick={apply} className={cn(buttonVariants({ variant: 'cta', size: 'cta' }), 'mt-4 w-full')}>
        {t('bulkNoteApply', { count: cells.length })}
      </button>
    </ResponsiveSheet>
  )
}

function ModeOption({ on, onClick, title, line }: { on: boolean; onClick(): void; title: string; line: string }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={cn('press min-h-16 rounded-[16px] px-3 py-2.5 text-left', on ? 'chosen' : 'hairline bg-card')}>
      <b className="block text-label font-semibold">{title}</b>
      <span className="block text-caption text-muted-foreground">{line}</span>
    </button>
  )
}
