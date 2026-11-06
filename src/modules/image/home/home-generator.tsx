'use client'

import { useTranslations } from 'next-intl'
import { useCallback, useMemo, useRef, useState } from 'react'

import type { FormAction } from '@/core/auth/ui'
import { UPLOAD_ACCEPT } from '@/core/storage/rules'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { HomeBench } from './home-bench'
import { HomeCard } from './home-card'
import type { HomeViewer } from './home-cta'
import { HomeDock } from './home-dock'
import { sampleFor, thumbFor } from './home-samples'
import { SignupSheet } from './signup-sheet'
import { TemplatePicker } from './template-picker'
import { useHomeGenerator } from './use-home-generator'
import { useOpenFromQuery, usePickEvents } from './use-pick-events'

export type HomeGeneratorProps = {
  // The live web catalogue (cached).
  templates: CatalogueTemplate[]
  defaultId: string | null
  // null: signed out (or not known yet while the page streams).
  viewer: HomeViewer | null
  googleAction: FormAction
  // This home page in its language ('/' or '/zh'): where sign-in comes back to.
  homePath: string
  // "3 free Standard images", from site.config (G3).
  freeImages: string
}

const smooth = () => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth')

// The first-screen generator (ARCHITECTURE §13 item 2, DESIGN §6.9 item 9): the phone card below
// 1024px, the bench above, one state. Signed in it starts the photo through the workspace's own
// pipeline and moves to that template's workspace; signed out it keeps the setup in this
// browser and asks for an account.
export function HomeGenerator({ templates, defaultId, viewer, googleAction, homePath, freeImages }: HomeGeneratorProps) {
  const t = useTranslations('home.generator')
  const state = useHomeGenerator({ templates, defaultId, viewer })
  const [pickerOn, setPickerOn] = useState<CatalogueTemplate | null>(null)
  const [signUp, setSignUp] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const bench = useRef<HTMLDivElement>(null)
  const card = useRef<HTMLElement>(null)
  const watch = useMemo(() => [bench, card], [])
  const bring = useCallback(() => {
    const shown = [bench.current, card.current].find((element) => element && element.offsetParent !== null)
    shown?.scrollIntoView({ behavior: smooth(), block: 'center' })
  }, [])
  const { choose } = state
  const onPick = useCallback(
    (id: string) => {
      if (!templates.some((template) => template.id === id)) return
      choose(id)
      bring()
    },
    [templates, choose, bring],
  )
  const onPreview = useCallback((id: string) => setPickerOn(templates.find((template) => template.id === id) ?? null), [templates])
  usePickEvents(onPick, onPreview)
  useOpenFromQuery(onPreview)
  const pickPhoto = () => file.current?.click()
  const askToSignUp = () => {
    void state.keepDraft()
    setSignUp(true)
  }
  const shared = { state, gift: t('gift', { images: freeImages }), onPickPhoto: pickPhoto, onOpenPicker: () => setPickerOn(state.template), onSignUp: askToSignUp }
  return (
    <div className="mk-generator">
      <HomeCard ref={card} thumbOf={thumbFor} {...shared} />
      <HomeBench ref={bench} thumb={state.template ? thumbFor(state.template) : null} {...shared} />
      <input
        ref={file}
        type="file"
        accept={UPLOAD_ACCEPT}
        hidden
        onChange={(event) => {
          const picked = event.currentTarget.files?.[0]
          if (picked) state.photo.pick(picked)
          event.currentTarget.value = ''
        }}
      />
      <TemplatePicker
        openOn={pickerOn}
        templates={templates}
        onClose={() => setPickerOn(null)}
        onPick={(id) => {
          setPickerOn(null)
          onPick(id)
        }}
        sampleOf={sampleFor}
        thumbOf={thumbFor}
      />
      {viewer ? null : <SignupSheet open={signUp} onOpenChange={setSignUp} googleAction={googleAction} next={homePath} gift={freeImages} />}
      <HomeDock watch={watch} hasPhoto={state.photo.url !== null} cost={state.template?.creditsCost['1k'] ?? null} onClick={bring} />
    </div>
  )
}
