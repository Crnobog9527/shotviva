'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { forwardRef, type ReactNode } from 'react'

import { REPLAY_BLOCK_CLASS } from '@/core/analytics/browser'
import { NOTE_MAX_LENGTH } from '@/core/templates/output-options'

import { allowsNoPhoto, type CatalogueTemplate } from '../catalogue/catalogue-template'
import { GroundedImg } from '../result/grounded-img'
import { UPLOAD_FORMAT_NAMES, UPLOAD_MAX_MB } from '../workspace/upload-formats'
import { notePlaceholder } from '../workspace/workspace-options'
import { MobileSizeMenu } from './size-menu'
import { HomeCtaButton } from './home-cta-button'
import { thumbImage } from './thumb-image'
import { ArrowIcon, GiftIcon, PlusIcon } from './home-icons'
import type { HomeGeneratorState } from './use-home-generator'

type Props = {
  state: HomeGeneratorState
  thumbOf(template: CatalogueTemplate): string | null
  gift: string
  onPickPhoto(): void
  onOpenPicker(): void
  onSignUp(): void
}

// Viewfinder well: the four corner marks, the 4:5 readout, then the photo or the empty prompt.
function Drop({ url, onPick }: { url: string | null; onPick(): void }) {
  const t = useTranslations('home.generator')
  const formats = useTranslations('app.workspace')('formats', { formats: useFormatter().list(UPLOAD_FORMAT_NAMES, { type: 'disjunction' }), mb: UPLOAD_MAX_MB })
  return (
    <button type="button" className="mk-drop" onClick={onPick} aria-label={url ? t('replaceAria') : t('addPhoto')}>
      <span className="mk-vf" aria-hidden>
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className="mk-hud" aria-hidden>
        4:5
      </span>
      {url ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL */}
          <img className={`${REPLAY_BLOCK_CLASS} mk-shot`} src={url} alt="" />
          <span className="mk-replace-pill" aria-hidden>
            {t('replace')}
          </span>
        </>
      ) : (
        <span className="mk-empty">
          <span className="mk-shutter" aria-hidden>
            <span>
              <PlusIcon className="size-6" />
            </span>
          </span>
          <strong>{t('addPhoto')}</strong>
          <small>{formats}</small>
        </span>
      )}
    </button>
  )
}

// The template rail: every live template as a thumbnail, the chosen one ringed in safelight.
function Rail({ state, thumbOf }: Pick<Props, 'state' | 'thumbOf'>) {
  const t = useTranslations('home.generator')
  return (
    <div className="mk-pick-rail" role="group" aria-label={t('template')}>
      {state.templates.map((template) => {
        const thumb = thumbOf(template)
        return (
          <button key={template.id} type="button" className="mk-pick" aria-pressed={template.id === state.template?.id} onClick={() => state.choose(template.id)}>
            {thumb ? <GroundedImg ground="white" {...thumbImage(thumb, 84)} alt="" /> : <span className="mk-pick-blank" aria-hidden />}
            {template.name}
          </button>
        )
      })}
    </div>
  )
}

// The note, with the workspace's example for the template's category as its placeholder
// (home.html #gen-note).
function NoteBox({ state }: { state: HomeGeneratorState }) {
  const t = useTranslations('app.workspace.notePlaceholder')
  const category = state.template ? state.template.category : ''
  return (
    <textarea
      className="mk-textarea"
      maxLength={NOTE_MAX_LENGTH}
      rows={2}
      placeholder={notePlaceholder(category, t)}
      value={state.note}
      onChange={(event) => state.setNote(event.target.value)}
    />
  )
}

// The phone and tablet generator (<1024, v3-b comp "stacked card"). Before a photo: the well and
// the current template; with a photo: the template rail and the note. One primary.
export const HomeCard = forwardRef<HTMLElement, Props>(function HomeCard({ state, thumbOf, gift, onPickPhoto, onOpenPicker, onSignUp }, ref) {
  const t = useTranslations('home.generator')
  const app = useTranslations('app')
  const { template, photo } = state
  const thumb = template ? thumbOf(template) : null
  const seeAll = (
    <button type="button" className="mk-link" onClick={onOpenPicker} disabled={!template}>
      {t('seeAll')}
      <ArrowIcon />
    </button>
  )
  return (
    <section className="mk-gen" id="gen" aria-label={t('label')} ref={ref}>
      {template?.photoInput !== 'none' ? <Drop url={photo.url} onPick={onPickPhoto} /> : null}
      {photo.error ? (
        <p role="alert" className="mk-gen-error">
          {app(`errors.${photo.error}`)}
        </p>
      ) : null}
      {photo.url || allowsNoPhoto(template) ? (
        <>
          <div className="mk-picks-head">
            <span>{t('template')}</span>
            {seeAll}
          </div>
          <Rail state={state} thumbOf={thumbOf} />
          <MobileSizeMenu value={state.aspect} onChange={state.setAspect} options={state.options} photoRatio={state.photoRatio} />
          <label className="mk-field">
            <span className="mk-field-label">
              {app('workspace.noteLabel')} <span className="text-muted-foreground">{app('workspace.optional')}</span>
            </span>
            <NoteBox state={state} />
          </label>
        </>
      ) : (
        <CurrentTemplate thumb={thumb} name={template?.name} seeAll={seeAll} />
      )}
      <div className="mk-gen-cta">
        <HomeCtaButton cta={state.cta} templateId={template?.id ?? null} place="card" onPickPhoto={onPickPhoto} onSignUp={onSignUp} onGenerate={state.generate} />
      </div>
      <p className="mk-gen-meta">
        <GiftIcon className="mk-gift-i" />
        {gift}
      </p>
    </section>
  )
})

function CurrentTemplate({ thumb, name, seeAll }: { thumb: string | null; name?: string; seeAll: ReactNode }) {
  const t = useTranslations('home.generator')
  return (
    <div className="mk-current">
      {thumb ? <GroundedImg className="mk-thumb" ground="white" {...thumbImage(thumb, 44)} alt="" /> : <span className="mk-thumb" aria-hidden />}
      <span className="mk-current-t">
        <small>{t('template')}</small>
        <b>{name ?? t('noTemplates')}</b>
      </span>
      {seeAll}
    </div>
  )
}
