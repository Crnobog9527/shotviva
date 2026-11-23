'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'

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
  // The list is still on its way (Create streams it after the page): `hinted` says this browser
  // last saw a non-empty list, so the Saved chip can hold its place meanwhile.
  pending?: boolean
  hinted?: boolean
  isSaved(id: string): boolean
  toggle(template: Target, surface: FavoriteSurface): void
  // Saves without toggling (the sign-in return); a no-op when it is already saved.
  save(template: Target, surface: FavoriteSurface): void
}

const FavoritesContext = createContext<Favorites | null>(null)

// null outside a provider: the heart is not drawn there.
export const useFavorites = () => useContext(FavoritesContext)

type Props = {
  // The account's saved template ids, newest first (core/favorites listFavoriteIds), or [] when
  // signed out; a promise when the page streams them after its first paint (Create).
  initialIds: readonly string[] | Promise<readonly string[]>
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

// Whether this browser last saw saved templates (per-viewer convenience; storage may be blocked).
const HINT_KEY = 'sv_has_saved'
function readHint(): boolean {
  try {
    return localStorage.getItem(HINT_KEY) === '1'
  } catch {
    return false
  }
}
function writeHint(saved: boolean) {
  try {
    localStorage.setItem(HINT_KEY, saved ? '1' : '0')
  } catch {
    // Blocked storage: the chip simply waits for the list.
  }
}
const noSubscribe = () => () => undefined

// A streamed list (a promise) seeds the store when it arrives; until then the store is empty.
function useArrived(initialIds: Props['initialIds'], seed: (ids: readonly string[]) => void) {
  const streamed = initialIds instanceof Promise
  const [arrived, setArrived] = useState(!streamed)
  useEffect(() => {
    if (!(initialIds instanceof Promise)) return
    let live = true
    initialIds.then((ids) => {
      if (!live) return
      seed(ids)
      writeHint(ids.length > 0)
      setArrived(true)
    }, () => live && setArrived(true))
    return () => {
      live = false
    }
  }, [initialIds, seed])
  // Read on the client only; the server's first paint never claims a saved list.
  const hinted = useSyncExternalStore(noSubscribe, readHint, () => false)
  return { pending: !arrived, hinted }
}

// onFailed must be stable (a state setter): the store keeps the first one.
function useStore(initialIds: Props['initialIds'], onFailed: (failure: FavoriteFailure) => void) {
  // Category and surface of the latest tap per template, for the event once the server has it.
  const [meta] = useState(() => new Map<string, { category: string; surface: FavoriteSurface }>())
  const [store] = useState(() =>
    createFavoritesStore(initialIds instanceof Promise ? [] : initialIds, send, {
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
  const seed = useCallback((list: readonly string[]) => store.seed(list), [store])
  const { pending, hinted } = useArrived(initialIds, seed)
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
      pending,
      hinted,
      isSaved: (id) => saved.has(id),
      toggle: (template, surface) => set(template, surface, !saved.has(template.id)),
      save: (template, surface) => (saved.has(template.id) ? undefined : set(template, surface, true)),
    }
  }, [ids, set, pending, hinted])
  return (
    <FavoritesContext value={value}>
      {children}
      <FavoriteNotice failure={failure} onClose={dismiss} />
    </FavoritesContext>
  )
}

// The admin 实时预览's heart (Owner 2026-11-14): drawn and pressable as for a signed-in user, but
// the saved state lives in this frame only; nothing is written or tracked.
export function PreviewFavorites({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<readonly string[]>([])
  const value = useMemo<Favorites>(() => ({
    ids,
    isSaved: (id) => ids.includes(id),
    toggle: ({ id }) => setIds((current) => current.includes(id) ? current.filter((other) => other !== id) : [id, ...current]),
    save: ({ id }) => setIds((current) => current.includes(id) ? current : [id, ...current]),
  }), [ids])
  return <FavoritesContext value={value}>{children}</FavoritesContext>
}
