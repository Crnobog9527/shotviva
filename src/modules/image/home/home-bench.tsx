'use client'

import { useTranslations } from 'next-intl'
import { forwardRef } from 'react'

import { NOTE_MAX_LENGTH } from '@/core/templates/output-options'

import { GroundedImg } from '../result/grounded-img'
import { thumbImage } from './thumb-image'
import { sizeLabel } from '../workspace/workspace-options'
import { HomeCtaButton } from './home-cta-button'
import { ChevronIcon, GiftIcon, PlusIcon } from './home-icons'
import { SizeMenu } from './size-menu'
import type { HomeGeneratorState } from './use-home-generator'

type Props = {
  state: HomeGeneratorState
  thumb: string | null
  gift: string
  onPickPhoto(): void
  onOpenPicker(): void
  onSignUp(): void
}

// The desktop generator (≥1024, v3-b comp "bench"): one 88px bar that never grows. Photo tile ·
// Template chip · Size chip · the note · Generate; the gift line under it.
export const HomeBench = forwardRef<HTMLDivElement, Props>(function HomeBench({ state, thumb, gift, onPickPhoto, onOpenPicker, onSignUp }, ref) {
  const t = useTranslations('home.generator')
  const app = useTranslations('app')
  const { template, photo } = state
  const name = template?.name ?? t('noTemplates')
  return (
    <div className="mk-bench-wrap" ref={ref}>
      <section className={photo.url ? 'mk-bench mk-has-photo' : 'mk-bench'} aria-label={t('label')}>
        <button type="button" className="mk-tile" onClick={onPickPhoto} aria-label={photo.url ? t('replaceAria') : t('addPhoto')}>
          <span className="mk-vf" aria-hidden>
            <i />
            <i />
            <i />
            <i />
          </span>
          <PlusIcon className="mk-plus" />
          {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, not an optimisable asset */}
          {photo.url ? <img className="mk-shot" src={photo.url} alt="" /> : null}
          <span className="mk-replace" aria-hidden>
            {t('replace')}
          </span>
        </button>
        <button type="button" className="mk-bchip" onClick={onOpenPicker} aria-haspopup="dialog" aria-label={t('changeTemplate', { name })} disabled={!template}>
          {thumb ? <GroundedImg className="mk-thumb" ground="white" {...thumbImage(thumb, 44)} alt="" /> : <span className="mk-thumb" aria-hidden />}
          <span className="mk-k">{t('template')}</span>
          <span className="mk-chip-name">{name}</span>
          <ChevronIcon />
        </button>
        <SizeMenu value={state.aspect} onChange={state.setAspect} label={sizeLabel(state.aspect, app)} />
        <input
          className="mk-bench-note"
          type="text"
          maxLength={NOTE_MAX_LENGTH}
          value={state.note}
          onChange={(event) => state.setNote(event.target.value)}
          placeholder={t('notePlaceholder')}
          aria-label={t('notePlaceholder')}
          autoComplete="off"
        />
        <HomeCtaButton cta={state.cta} templateId={template?.id ?? null} place="bench" onPickPhoto={onPickPhoto} onSignUp={onSignUp} onGenerate={state.generate} />
      </section>
      {photo.error ? (
        <p role="alert" className="mk-bench-error">
          {app(`errors.${photo.error}`)}
        </p>
      ) : (
        <p className="mk-bench-gift">
          <GiftIcon className="mk-gift-i" />
          {gift}
        </p>
      )}
    </div>
  )
})
