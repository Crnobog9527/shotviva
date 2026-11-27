'use client'

import { useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react'

import { trackTemplateView } from '@/core/analytics/browser'
import type { Locale } from '@/core/i18n'
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
import { useRandomOpening } from './use-random-opening'
import type { PanelRequest } from './panel/panel-request'
import { loadPanel, useBrowseClicks, usePanelClicks, usePanelFromQuery, useTemplatePanel } from './panel/use-template-panel'

export type HomeGeneratorProps = {
  // On home this is only the opening template and the rail. Landing pages supply their catalogue.
  templates: CatalogueTemplate[]
  catalogue: HomeCatalogueSource
  defaultId: string | null
  // null: signed out (or not known yet while the page streams).
  viewer: HomeViewer | null
  // This home page in its language ('/' or '/zh'): where sign-in comes back to.
  homePath: string
  // "3 free Standard images", from site.config (G3).
  freeImages: string
  // The opening template's cover shapes, measured on the server, so the preview is drawn in its
  // final shape before any script runs.
  initialCovers: InitialCovers
  // Open on a random 精选组合 member once the page has loaded (home-opening.ts); the server drew
  // the first one.
  shuffle?: boolean
  // false: the signed-out stand-in shown while the session streams in; it leaves the address's
  // ?panel= for the generator that replaces it (use-template-panel.ts).
  settled?: boolean
}

// Keep the template picker warm for browsing; the template panel (Create's dialog, with its sheet)
// loads on the first sign of interest (use-template-panel.ts).
const loadPicker = () => import('./template-picker')
const TemplatePicker = dynamic(() => loadPicker().then((m) => m.TemplatePicker), { ssr: false })
const TemplatePanel = dynamic(() => loadPanel().then((m) => m.TemplatePanel), { ssr: false })

function usePrefetchPicker() {
  useEffect(() => {
    const start = () => void loadPicker()
    if (typeof window.requestIdleCallback !== 'function') return void window.setTimeout(start, 1500)
    const id = window.requestIdleCallback(start, { timeout: 4000 })
    return () => window.cancelIdleCallback(id)
  }, [])
}

const smooth = () => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth')

// The first-screen generator (ARCHITECTURE §13 item 2, DESIGN §6.9 item 9): one small creation
// card, stacked on phones and two columns from 1024px (home-panel.tsx), kept as the first screen's
// hook. Everything that asks for a template (its picture and Change open the browse list; a pick
// there, any card on the page, its Upload photo) opens the template panel: Create's own dialog,
// generating as Create does when signed in, the sign-up button when not (Owner 2026-11-25).
export function HomeGenerator({ templates: all, catalogue, defaultId, viewer, homePath, freeImages, initialCovers, settled, shuffle }: HomeGeneratorProps) {
  // The panel has one upload card: a template with named image slots (§5.1e) opens in its own
  // workspace instead, never here.
  const templates = useMemo(() => all.filter((template) => !isSlotTemplate(template)), [all])
  const t = useTranslations('home.generator')
  const picker = useHomeCatalogue(templates, catalogue)
  const state = useHomeGenerator({ templates, defaultId, viewer, find: picker.find })
  const [pickerOn, setPickerOn] = useState<string | null>(null)
  const [pickerPath, setPickerPath] = useState<readonly string[]>([])
  // The visitor opened the browse list or the panel: the random opening no longer swaps the card.
  const interactedRef = useRef(false)
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
  const openCatalogue = picker.open
  const onPreview = useCallback((id: string, path: readonly string[] = []) => {
    interactedRef.current = true
    setPickerPath(path)
    setPickerOn(id)
    openCatalogue()
  }, [openCatalogue])
  useBrowseClicks(onPreview)
  const opened = useGeneratorPanel({ picker, state, bring, settled, interactedRef })
  useOpening({ shuffle, settled, card: panel }, catalogue.locale, state, interactedRef)
  usePrefetchPicker()
  const current = state.template?.id ?? null
  const withPhoto = (picked: File) => { if (current) opened.open({ templateId: current, set: null, file: picked }) }
  // The new-user gift (site.config freeCredits through the page, 100 with the v2 catalogue): one
  // line for the small card and the panel's sign-up bar.
  const gift = t('gift', { images: freeImages })
  const shared = { state, gift, onPickPhoto: () => file.current?.click(), onPhotoPicked: withPhoto, fileInputId: fileId,
    onOpenPicker: () => { if (current) onPreview(current) }, onSignUp: () => { if (current) opened.open({ templateId: current, set: null }) } }
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
          if (picked) withPhoto(picked)
          event.currentTarget.value = ''
        }}
      />
      <TemplatePicker
        openOn={pickerOn}
        openPath={pickerPath}
        catalogue={picker.data}
        failed={picker.failed}
        onRetry={picker.open}
        onClose={() => setPickerOn(null)}
        onPick={(picked) => {
          setPickerOn(null)
          trackTemplateView(picked, 'home_picker')
          opened.open({ templateId: picked.id, set: null })
        }}
        sampleOf={sampleFor}
        thumbOf={thumbFor}
      />
      {opened.panel !== undefined ? <TemplatePanel panel={opened.panel} viewer={viewer} pagePath={homePath} gift={gift} onClose={opened.close} /> : null}
      <HomeDock show={away && !footer} canStartWithoutPicking={canStartWithoutPicking} onClick={bring} />
    </div>
    </FavoritesProvider>
  )
}

type PanelArgs = { picker: ReturnType<typeof useHomeCatalogue>; state: ReturnType<typeof useHomeGenerator>; bring(): void; settled: boolean | undefined; interactedRef: { current: boolean } }

// The template panel and everything that opens it. A template it cannot show (not live, or a
// slot template) still goes into the first-screen card, as a card click always did. The first
// opening mounts the panel; afterwards it stays mounted (undefined: never opened) so it can close
// with its motion and give focus back.
function useGeneratorPanel({ picker, state, bring, settled, interactedRef }: PanelArgs) {
  const { choose } = state
  const onMissing = useCallback((id: string) => {
    void choose(id).then((picked) => {
      if (picked) bring()
    }).catch(() => undefined)
  }, [choose, bring])
  const { panel, open: openPanel, close } = useTemplatePanel({ load: picker.load, onMissing })
  const [mounted, setMounted] = useState(false)
  const open = useCallback((request: PanelRequest, opener?: Element | null) => {
    interactedRef.current = true
    setMounted(true)
    openPanel(request, opener)
  }, [openPanel, interactedRef])
  const { load } = picker
  const prefetch = useCallback(() => {
    void loadPanel()
    void load().catch(() => undefined)
  }, [load])
  usePanelClicks(open, prefetch)
  usePanelFromQuery(open, settled !== false)
  return { panel: mounted ? panel : undefined, open, close }
}

// The random opening (use-random-opening.ts), only while the visitor has done nothing with the
// card: nothing chosen, typed or changed in it, no panel or browse list opened.
function useOpening({ shuffle, settled, card }: { shuffle?: boolean; settled?: boolean; card: RefObject<HTMLElement | null> }, locale: Locale, state: ReturnType<typeof useHomeGenerator>, interactedRef: { current: boolean }) {
  const { untouched, show } = state
  // The signed-out stand-in shown while the session streams in never swaps; the real card does.
  useRandomOpening({ enabled: shuffle === true && settled !== false, card, locale, currentId: state.template?.id ?? null, untouched: () => untouched() && !interactedRef.current, show })
}

