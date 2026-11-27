'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { useId } from 'react'

import { REPLAY_BLOCK_CLASS } from '@/core/analytics/browser'
import { NOTE_MAX_LENGTH } from '@/core/templates/output-options'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { GroundedImg } from '../result/grounded-img'
import { UPLOAD_FORMAT_NAMES, UPLOAD_MAX_MB } from '../workspace/upload-formats'
import { HOME_RAIL_SIZE } from './home-catalogue'
import { PlusIcon } from './home-icons'
import { thumbImage } from './thumb-image'
import type { HomeGeneratorState } from './use-home-generator'

function useFormats(): string {
  // Chinese lists join with 「或」 and no space (「PNG或WebP」); a space goes between Chinese and Latin.
  const formats = useFormatter().list(UPLOAD_FORMAT_NAMES, { type: 'disjunction' }).replace(/([A-Za-z0-9])或([A-Za-z0-9])/g, '$1 或 $2')
  return useTranslations('app.workspace')('formats', { formats, mb: UPLOAD_MAX_MB })
}

// The first step, the obvious one: a card that asks for the phone photo, then shows it. While
// empty it is hidden at every width (marketing.css): the big primary says the same thing, and
// PanelFormats carries the format hint under it (Owner 2026-11-13, one upload action).
export function PanelUpload({ url, onPick }: { url: string | null; onPick(): void }) {
  const t = useTranslations('home.generator')
  const formats = useFormats()
  const statusId = useId()
  if (!url) {
    return (
      <button type="button" className="mk-up mk-up-empty" onClick={onPick}>
        <span className="mk-up-plus" aria-hidden>
          <PlusIcon className="size-6" />
        </span>
        <span className="mk-up-t">
          <b>{t('uploadPhoto')}</b>
          <small>{formats}</small>
        </span>
      </button>
    )
  }
  return (
    <div className="mk-up mk-up-has relative">
      {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL */}
      <img className={`${REPLAY_BLOCK_CLASS} mk-up-thumb`} src={url} alt="" />
      <span id={statusId} className="mk-up-t">
        <b>{t('photoReady')}</b>
        <small>{t('photoReadyHint')}</small>
      </span>
      {/* Keep the full card tappable while the visible action supplies the button's name. */}
      <button type="button" className="mk-up-re after:absolute after:inset-0" onClick={onPick} aria-describedby={statusId}>
        {t('replace')}
      </button>
    </div>
  )
}

// The format and size hint under the primary while no photo is chosen.
export function PanelFormats({ state }: { state: HomeGeneratorState }) {
  const formats = useFormats()
  return state.template?.photoInput !== 'none' && !state.photo.url ? <p className="mk-panel-fmt">{formats}</p> : null
}

// The chosen template first, then the next few in catalogue order; the full picker one tap away.
function railOf(templates: readonly CatalogueTemplate[], chosen: CatalogueTemplate | null): CatalogueTemplate[] {
  const rest = templates.filter((template) => template.id !== chosen?.id)
  return (chosen ? [chosen, ...rest] : rest).slice(0, HOME_RAIL_SIZE)
}

export function PanelRail({ state, thumbOf, onOpenPicker }: { state: HomeGeneratorState; thumbOf(template: CatalogueTemplate): string | null; onOpenPicker(): void }) {
  const t = useTranslations('home.generator')
  return (
    <div className="mk-rail" role="group" aria-label={t('template')}>
      {railOf(state.templates, state.template).map((template) => {
        const thumb = thumbOf(template)
        return (
          <button key={template.id} type="button" className="mk-rail-i" aria-pressed={template.id === state.template?.id} onClick={() => state.choose(template.id)}>
            {thumb ? <GroundedImg ground="white" {...thumbImage(thumb, 64)} alt="" /> : <span className="mk-rail-blank" aria-hidden />}
            <span>{template.name}</span>
          </button>
        )
      })}
      <button type="button" className="mk-rail-all" onClick={onOpenPicker} aria-haspopup="dialog">
        {t('allTemplates')}
      </button>
    </div>
  )
}

// A real label for the note (read aloud, kept off screen: the placeholder says the same and
// the row has no room), not the placeholder standing in for one (review of #523, F5).
export function PanelNote({ state }: { state: HomeGeneratorState }) {
  const t = useTranslations('home.generator')
  const app = useTranslations('app.workspace')
  return (
    <label className="mk-panel-note-l">
      <span className="sr-only">
        {app('noteLabel')} {app('optional')}
      </span>
      <input
        className="mk-panel-note"
        type="text"
        maxLength={NOTE_MAX_LENGTH}
        value={state.note}
        onChange={(event) => state.setNote(event.target.value)}
        placeholder={t('notePlaceholder')}
        autoComplete="off"
      />
    </label>
  )
}
