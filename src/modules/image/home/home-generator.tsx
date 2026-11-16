'use client'

import { useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'
import { useCallback, useId, useMemo, useRef, useState } from 'react'

import { trackTemplateView } from '@/core/analytics/browser'
import type { FormAction } from '@/core/auth/ui'
import { UPLOAD_ACCEPT } from '@/core/storage/rules'

import { allowsNoPhoto, isSlotTemplate, type CatalogueTemplate } from '../catalogue/catalogue-template'
import { FavoritesProvider } from '../favorites/favorites-provider'
import { FavoriteReturn } from '../favorites/favorite-return-effect'
import type { HomeViewer } from './home-cta'
import type { HomeCatalogueSource } from './home-catalogue'
import { HomeDock } from './home-dock'
import { HomePanel, type InitialCovers } from './home-panel'
import { sampleFor, thumbFor } from './home-samples'
import { useGeneratorAway } from './use-generator-away'
import { useHeaderUpload } from './use-header-upload'
import { useHomeCatalogue } from './use-home-catalogue'
import { useHomeGenerator } from './use-home-generator'
import { useOpenFromQuery, usePickEvents } from './use-pick-events'

export type HomeGeneratorProps = {
  // On home this is only the opening template and the rail. Landing pages supply their catalogue.
  templates: CatalogueTemplate[]
  catalogue: HomeCatalogueSource
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

// Both dialogs are used after the corresponding action, and never rendered in the initial panel.
const TemplatePicker = dynamic(() => import('./template-picker').then((m) => m.TemplatePicker), { ssr: false })
const SignupSheet = dynamic(() => import('./signup-sheet').then((m) => m.SignupSheet), { ssr: false })

const smooth = () => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth')

// The first-screen generator (ARCHITECTURE §13 item 2, DESIGN §6.9 item 9): one creation panel,
// stacked on phones and two columns from 1024px (home-panel.tsx). Signed in it starts the photo through the workspace's own
// pipeline and moves to that template's workspace; signed out it keeps the setup in this
// browser and asks for an account.
export function HomeGenerator({ templates: all, catalogue, defaultId, viewer, googleAction, homePath, freeImages, initialCovers }: HomeGeneratorProps) {
  // The panel has one upload card: a template with named image slots (§5.1e) opens in its own
  // workspace instead, never here.
  const templates = useMemo(() => all.filter((template) => !isSlotTemplate(template)), [all])
  const t = useTranslations('home.generator')
  const picker = useHomeCatalogue(templates, catalogue)
  const state = useHomeGenerator({ templates, defaultId, viewer, find: picker.find })
  const [pickerOn, setPickerOn] = useState<string | null>(null)
  // Null means it has never opened. Afterwards the sheet owns its exit animation and focus.
  const [signUp, setSignUp] = useState<boolean | null>(null)
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
  const openCatalogue = picker.open
  const onPreview = useCallback((id: string) => {
    setPickerOn(id)
    openCatalogue()
  }, [openCatalogue])
  const onPick = useCallback((id: string) => {
    void choose(id).then((picked) => {
      if (picked) bring()
    }).catch(() => setPickerOn(id))
  }, [choose, bring])
  usePickEvents(onPick, onPreview)
  useOpenFromQuery(onPreview)
  const pickPhoto = () => file.current?.click()
  const askToSignUp = () => {
    void state.keepDraft()
    setSignUp(true)
  }
  const shared = { state, gift: t('gift', { images: freeImages }), onPickPhoto: pickPhoto, fileInputId: fileId, onOpenPicker: () => { if (state.template) onPreview(state.template.id) }, onSignUp: askToSignUp }
  // Signed in, the picker's hearts save on the visitor's account; signed out a heart goes to
  // sign-in and comes back here to save it (T83).
  return (
    <FavoritesProvider initialIds={viewer?.favoriteIds ?? []} signedIn={viewer !== null} returnTo={homePath}>
    <div className="mk-generator">
      <FavoriteReturn signedIn={viewer !== null} find={picker.find} onSaved={onPreview} />
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
      {pickerOn !== null && <TemplatePicker
        openOn={pickerOn}
        catalogue={picker.data}
        failed={picker.failed}
        onRetry={picker.open}
        onClose={() => setPickerOn(null)}
        onPick={(picked) => {
          setPickerOn(null)
          trackTemplateView(picked, 'home_picker')
          onPick(picked.id)
        }}
        sampleOf={sampleFor}
        thumbOf={thumbFor}
      />}
      {!viewer && signUp !== null && <SignupSheet open={signUp} onOpenChange={setSignUp} googleAction={googleAction} next={homePath} gift={freeImages} />}
      <HomeDock show={away && !footer} canStartWithoutPicking={canStartWithoutPicking} onClick={bring} />
    </div>
    </FavoritesProvider>
  )
}
