'use client'

import { useTranslations } from 'next-intl'
import { forwardRef, useId } from 'react'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { HomeCtaButton } from './home-cta-button'
import { GiftIcon } from './home-icons'
import { PanelFormats, PanelNote, PanelRail, PanelUpload } from './panel-parts'
import { PanelStage } from './panel-stage'
import { MobileSizeMenu, SizeMenu } from './size-menu'
import type { StageCover } from './use-stage-cover'
import type { HomeGeneratorState } from './use-home-generator'

// What the server measured for the template the page opens on (core/templates/cover-ratio.ts).
export type InitialCovers = { templateId: string; after: StageCover | null; beforeRatio: number | null } | null

type Props = {
  state: HomeGeneratorState
  initialCovers: InitialCovers
  thumbOf(template: CatalogueTemplate): string | null
  gift: string
  onPickPhoto(): void
  onOpenPicker(): void
  onSignUp(): void
}

function insetOf(state: HomeGeneratorState, initial: InitialCovers, labels: { mine: string; example: string }) {
  if (state.photo.url) return { url: state.photo.url, ratio: state.photoRatio, label: labels.mine, mine: true }
  const before = state.template?.cover.before
  if (!before) return null
  return { url: before, ratio: initial?.templateId === state.template?.id ? initial.beforeRatio : null, label: labels.example, mine: false }
}

// The picture the stage shows (the result, or a motion cover's still) and the server's measured
// shape when it is the template the page opened on.
function stageOf(state: HomeGeneratorState, initialCovers: InitialCovers) {
  const template = state.template
  const after = template ? template.cover.after ?? template.cover.poster : null
  return { after, initial: initialCovers && initialCovers.templateId === template?.id ? initialCovers.after : null }
}

// The button's accessible name is its visible word; the template's name is read as its
// description (WCAG 2.5.3, review of #523).
function PanelHead({ template, onOpenPicker }: { template: CatalogueTemplate | null; onOpenPicker(): void }) {
  const t = useTranslations('home.generator')
  const nameId = useId()
  return (
    <div className="mk-panel-head">
      <span className="mk-panel-name" id={nameId}>{template ? template.name : t('noTemplates')}</span>
      <button type="button" className="mk-panel-change" onClick={onOpenPicker} disabled={!template} aria-haspopup="dialog" aria-describedby={nameId}>
        {t('change')}
      </button>
    </div>
  )
}

// The first-screen generator as a compact creation panel (Owner 2026-11-12, 方案 B): the chosen
// template's result, whole, with the photo it came from; the upload; the template rail; size and
// note; Generate. Phones stack it (preview → upload → template → size and note → Generate);
// from 1024 it is two columns, the preview kept small so the hero pair stays the largest picture.
export const HomePanel = forwardRef<HTMLElement, Props>(function HomePanel({ state, initialCovers, thumbOf, gift, onPickPhoto, onOpenPicker, onSignUp }, ref) {
  const t = useTranslations('home.generator')
  const app = useTranslations('app')
  const tags = useTranslations('marketing.home')
  const { template, photo } = state
  const { after, initial } = stageOf(state, initialCovers)
  const inset = insetOf(state, initialCovers, { mine: t('yourPhoto'), example: tags('phone') })
  const templateId = template?.id ?? null
  return (
    // A template without a photo (photoInput 'none') has no upload card: its column closes up.
    <section className={template?.photoInput === 'none' ? 'mk-panel mk-panel-noup' : 'mk-panel'} id="gen" aria-label={t('label')} ref={ref}>
      <PanelHead template={template} onOpenPicker={onOpenPicker} />
      <PanelStage name={template?.name ?? ''} after={after} initial={initial} inset={inset} />
      {template?.photoInput !== 'none' ? <PanelUpload url={photo.url} onPick={onPickPhoto} /> : null}
      {photo.error ? <p role="alert" className="mk-panel-error">{app(`errors.${photo.error}`)}</p> : null}
      <PanelRail state={state} thumbOf={thumbOf} onOpenPicker={onOpenPicker} />
      <div className="mk-panel-row">
        <div className="mk-panel-size-d">
          <SizeMenu value={state.aspect} onChange={state.setAspect} options={state.options} photoRatio={state.photoRatio} />
        </div>
        <div className="mk-panel-size-m">
          <MobileSizeMenu value={state.aspect} onChange={state.setAspect} options={state.options} photoRatio={state.photoRatio} />
        </div>
        <PanelNote state={state} />
      </div>
      <div className="mk-panel-cta">
        <HomeCtaButton cta={state.cta} templateId={templateId} onPickPhoto={onPickPhoto} onSignUp={onSignUp} onGenerate={state.generate} />
        <PanelFormats state={state} />
        <p className="mk-panel-gift">
          <GiftIcon className="mk-gift-i" />
          {gift}
        </p>
      </div>
    </section>
  )
})
