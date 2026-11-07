'use client'

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'

import { trackTemplateFavorite } from '@/core/analytics/browser'
import type { EventProps } from '@/core/analytics/events'
import { useRouter } from '@/core/i18n'

import { FavoriteNotice } from './favorite-notice'
import { createFavoritesStore, type FavoriteFailure, type SendResult } from './favorites-store'
import { rememberFavoriteReturn, signInForFavorite } from './favorite-return'

export type FavoriteSurface = EventProps<'template_favorite'>['surface']
type Target = { id: string; category: string }

type Favorites = {
  ids: readonly string[]
  isSaved(id: string): boolean
  toggle(template: Target, surface: FavoriteSurface): void
  // Saves without toggling (the sign-in return); a no-op when it is already saved.
  save(template: Target, surface: FavoriteSurface): void
}

const FavoritesContext = createContext<Favorites | null>(null)

// null outside a provider: the heart is not drawn there.
export const useFavorites = () => useContext(FavoritesContext)

type Props = {
  // The account's saved template ids, newest first (core/favorites listFavoriteIds), or [] when signed out.
  initialIds: readonly string[]
  // Signed out, a tap goes to sign-in and comes back to `returnTo` to save it there.
  signedIn: boolean
  returnTo?: string
  children: ReactNode
}

async function send(templateId: string, saved: boolean): Promise<SendResult> {
  const response = await fetch(`/api/favorites/${encodeURIComponent(templateId)}`, { method: saved ? 'PUT' : 'DELETE' })
  if (response.ok) return { ok: true }
  const body = (await response.json().catch(() => null)) as { code?: unknown } | null
  return { ok: false, code: typeof body?.code === 'string' ? body.code : null }
}

// onFailed must be stable (a state setter): the store keeps the first one.
function useStore(initialIds: readonly string[], onFailed: (failure: FavoriteFailure) => void) {
  // Category and surface of the latest tap per template, for the event once the server has it.
  const [meta] = useState(() => new Map<string, { category: string; surface: FavoriteSurface }>())
  const [store] = useState(() =>
    createFavoritesStore(initialIds, send, {
      onSynced(id, saved) {
        const tap = meta.get(id)
        if (tap) trackTemplateFavorite({ id, category: tap.category }, saved ? 'add' : 'remove', tap.surface)
      },
      onFailed: (_id, failure) => onFailed(failure),
    }),
  )
  const ids = useSyncExternalStore(store.subscribe, store.ids, store.ids)
  return { store, ids, meta }
}

// One per page that shows hearts (Create, the home generator): the card, the dialog and the
// Saved chip all read the same list, so a tap anywhere shows everywhere at once.
export function FavoritesProvider({ initialIds, signedIn, returnTo, children }: Props) {
  const router = useRouter()
  const [failure, setFailure] = useState<FavoriteFailure | null>(null)
  const { store, ids, meta } = useStore(initialIds, setFailure)
  const dismiss = useCallback(() => setFailure(null), [])
  const set = useCallback(
    (template: Target, surface: FavoriteSurface, saved: boolean) => {
      if (!signedIn) {
        if (!returnTo) return
        rememberFavoriteReturn(template.id)
        router.push(signInForFavorite(returnTo, template.id))
        return
      }
      meta.set(template.id, { category: template.category, surface })
      setFailure(null)
      store.set(template.id, saved)
    },
    [signedIn, returnTo, router, meta, store],
  )
  const value = useMemo<Favorites>(() => {
    const saved = new Set(ids)
    return {
      ids,
      isSaved: (id) => saved.has(id),
      toggle: (template, surface) => set(template, surface, !saved.has(template.id)),
      save: (template, surface) => (saved.has(template.id) ? undefined : set(template, surface, true)),
    }
  }, [ids, set])
  return (
    <FavoritesContext value={value}>
      {children}
      <FavoriteNotice failure={failure} onClose={dismiss} />
    </FavoritesContext>
  )
}
