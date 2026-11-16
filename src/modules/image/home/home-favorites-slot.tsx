'use client'

import dynamic from 'next/dynamic'

import { trackTemplateView } from '@/core/analytics/browser'

import { FavoriteReturn } from '../favorites/favorite-return-effect'
import { FavoritesProvider } from '../favorites/favorites-provider'
import type { HomeViewer } from './home-cta'
import { sampleFor, thumbFor } from './home-samples'
import type { useHomeCatalogue } from './use-home-catalogue'

const TemplatePicker = dynamic(() => import('./template-picker').then((m) => m.TemplatePicker), { ssr: false })

type Props = {
  viewer: { viewer: HomeViewer | null } | null
  homePath: string
  picker: ReturnType<typeof useHomeCatalogue>
  pickerOn: string | null
  setPickerOn(value: string | null): void
  onPreview(id: string): void
  onPick(id: string): void
}

export function HomeFavoritesSlot({ viewer: state, homePath, picker, pickerOn, setPickerOn, onPreview, onPick }: Props) {
  const viewer = state?.viewer ?? null
  return (
    <FavoritesProvider key={viewer ? 'member' : 'visitor'} initialIds={viewer?.favoriteIds ?? []} signedIn={viewer !== null} returnTo={homePath}>
      {state !== null && <FavoriteReturn signedIn={viewer !== null} find={picker.find} onSaved={onPreview} />}
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
    </FavoritesProvider>
  )
}
