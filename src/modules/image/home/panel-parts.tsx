'use client'

import { useFormatter, useTranslations } from 'next-intl'

import { REPLAY_BLOCK_CLASS } from '@/core/analytics/browser'
import { NOTE_MAX_LENGTH } from '@/core/templates/output-options'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { GroundedImg } from '../result/grounded-img'
import { UPLOAD_FORMAT_NAMES, UPLOAD_MAX_MB } from '../workspace/upload-formats'
import { PlusIcon } from './home-icons'
import { thumbImage } from './thumb-image'
import type { HomeGeneratorState } from './use-home-generator'

// The first step, the obvious one: a card that asks for the phone photo, then shows it.
export function PanelUpload({ url, onPick }: { url: string | null; onPick(): void }) {
  const t = useTranslations('home.generator')
  const formats = useTranslations('app.workspace')('formats', { formats: useFormatter().list(UPLOAD_FORMAT_NAMES, { type: 'disjunction' }), mb: UPLOAD_MAX_MB })
  return (
    <button type="button" className={url ? 'mk-up mk-up-has' : 'mk-up'} onClick={onPick} aria-label={url ? t('replaceAria') : undefined}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- a local object URL
        <img className={`${REPLAY_BLOCK_CLASS} mk-up-thumb`} src={url} alt="" />
      ) : (
        <span className="mk-up-plus" aria-hidden>
          <PlusIcon className="size-6" />
        </span>
      )}
      <span className="mk-up-t">
        <b>{url ? t('photoReady') : t('uploadPhoto')}</b>
        <small>{url ? t('photoReadyHint') : formats}</small>
      </span>
      {url ? (
        <span className="mk-up-re" aria-hidden>
          {t('replace')}
        </span>
      ) : null}
    </button>
  )
}

// The chosen template first, then the next few in catalogue order; the full picker one tap away.
const RAIL = 4
function railOf(templates: readonly CatalogueTemplate[], chosen: CatalogueTemplate | null): CatalogueTemplate[] {
  const rest = templates.filter((template) => template.id !== chosen?.id)
  return (chosen ? [chosen, ...rest] : rest).slice(0, RAIL)
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
