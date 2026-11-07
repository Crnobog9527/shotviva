'use client'

import { useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { trackTemplateView } from '@/core/analytics/browser'
import type { FormAction } from '@/core/auth/ui'
import { UPLOAD_ACCEPT } from '@/core/storage/rules'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { HomeBench } from './home-bench'
import { HomeCard } from './home-card'
import type { HomeViewer } from './home-cta'
import { HomeDock } from './home-dock'
import { sampleFor, thumbFor } from './home-samples'
import { useGeneratorAway } from './use-generator-away'
import { useHeaderUpload } from './use-header-upload'
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

// The picker and the sign-up sheet are closed on arrival and carry the dialog, drawer and
// sign-in code (radix, vaul, hCaptcha): they load once the page is idle, not before the first
// paint. Both render nothing until then, which is what a closed one shows anyway.
const loadPicker = () => import('./template-picker')
const loadSignup = () => import('./signup-sheet')
const TemplatePicker = dynamic(() => loadPicker().then((m) => m.TemplatePicker), { ssr: false })
const SignupSheet = dynamic(() => loadSignup().then((m) => m.SignupSheet), { ssr: false })

function usePrefetchDialogs() {
  useEffect(() => {
    const start = () => void Promise.all([loadPicker(), loadSignup()])
    if (typeof window.requestIdleCallback !== 'function') return void window.setTimeout(start, 1500)
    const id = window.requestIdleCallback(start, { timeout: 4000 })
    return () => window.cancelIdleCallback(id)
  }, [])
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
  const { away, past, footer } = useGeneratorAway(watch)
  const hasPhoto = state.photo.url !== null
  // The header's stand-in (768px up): "Upload photo" opens the picker straight from the click
  // (browsers allow it only inside the user's gesture) while the page scrolls back behind it;
  // with a photo in, "Generate" just brings the generator back.
  const fromHeader = useCallback(
    (mode: 'upload' | 'generate') => {
      if (mode === 'upload') file.current?.click()
      bring()
    },
    [bring],
  )
  useHeaderUpload(past ? (hasPhoto ? 'generate' : 'upload') : null, fromHeader)
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
  usePrefetchDialogs()
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
          const picked = templates.find((template) => template.id === id)
          if (picked) trackTemplateView(picked, 'home_picker')
          onPick(id)
        }}
        sampleOf={sampleFor}
        thumbOf={thumbFor}
      />
      {viewer ? null : <SignupSheet open={signUp} onOpenChange={setSignUp} googleAction={googleAction} next={homePath} gift={freeImages} />}
      <HomeDock show={away && !footer} hasPhoto={hasPhoto} cost={state.template?.creditsCost['1k'] ?? null} onClick={bring} />
    </div>
  )
}
