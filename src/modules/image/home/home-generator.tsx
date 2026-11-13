'use client'

import { useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'

import { trackTemplateView } from '@/core/analytics/browser'
import type { FormAction } from '@/core/auth/ui'
import { UPLOAD_ACCEPT } from '@/core/storage/rules'

import { allowsNoPhoto, isSlotTemplate, type CatalogueTemplate } from '../catalogue/catalogue-template'
import { FavoritesProvider } from '../favorites/favorites-provider'
import { FavoriteReturn } from '../favorites/favorite-return-effect'
import type { HomeViewer } from './home-cta'
import { HomeDock } from './home-dock'
import { HomePanel, type InitialCovers } from './home-panel'
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
  // The opening template's cover shapes, measured on the server, so the preview is drawn in its
  // final shape before any script runs.
  initialCovers: InitialCovers
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

// The first-screen generator (ARCHITECTURE §13 item 2, DESIGN §6.9 item 9): one creation panel,
// stacked on phones and two columns from 1024px (home-panel.tsx). Signed in it starts the photo through the workspace's own
// pipeline and moves to that template's workspace; signed out it keeps the setup in this
// browser and asks for an account.
export function HomeGenerator({ templates: all, defaultId, viewer, googleAction, homePath, freeImages, initialCovers }: HomeGeneratorProps) {
  // The panel has one upload card: a template with named image slots (§5.1e) opens in its own
  // workspace instead, never here.
  const templates = useMemo(() => all.filter((template) => !isSlotTemplate(template)), [all])
  const t = useTranslations('home.generator')
  const state = useHomeGenerator({ templates, defaultId, viewer })
  const [pickerOn, setPickerOn] = useState<CatalogueTemplate | null>(null)
  const [signUp, setSignUp] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const fileId = useId()
  const panel = useRef<HTMLElement>(null)
  const watch = useMemo(() => [panel], [])
  const bring = useCallback(() => panel.current?.scrollIntoView({ behavior: smooth(), block: 'center' }), [])
  const { away, past, footer } = useGeneratorAway(watch)
  const canStartWithoutPicking = state.photo.url !== null || allowsNoPhoto(state.template)
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
  useHeaderUpload(past ? (canStartWithoutPicking ? 'generate' : 'upload') : null, fromHeader)
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
  const shared = { state, gift: t('gift', { images: freeImages }), onPickPhoto: pickPhoto, fileInputId: fileId, onOpenPicker: () => setPickerOn(state.template), onSignUp: askToSignUp }
  // Signed in, the picker's hearts save on the visitor's account; signed out a heart goes to
  // sign-in and comes back here to save it (T83).
  return (
    <FavoritesProvider initialIds={viewer?.favoriteIds ?? []} signedIn={viewer !== null} returnTo={homePath}>
    <div className="mk-generator">
      <FavoriteReturn signedIn={viewer !== null} templates={templates} onSaved={onPreview} />
      <HomePanel ref={panel} initialCovers={initialCovers} thumbOf={thumbFor} {...shared} />
      {/* Visually hidden, not display:none: the primary is a <label for> it, which some phone
          browsers (Huawei, older iOS) ignore when the input is display:none or clicked from JS. */}
      <input
        ref={file}
        id={fileId}
        type="file"
        accept={UPLOAD_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
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
      <HomeDock show={away && !footer} canStartWithoutPicking={canStartWithoutPicking} onClick={bring} />
    </div>
    </FavoritesProvider>
  )
}
