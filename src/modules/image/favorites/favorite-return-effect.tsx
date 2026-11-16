'use client'

import { useEffect, useRef } from 'react'

import { favoriteFromSearch, takeFavoriteReturn, withoutFavorite } from './favorite-return'
import { useFavorites } from './favorites-provider'

type Props = {
  signedIn: boolean
  find(id: string): Promise<{ id: string; category: string } | null>
  // Shows the template that was just saved (the home picker opens on it).
  onSaved(id: string): void
}

// Back from sign-in with ?favorite=<id> (ARCHITECTURE §5.1b): take the parameter off the address
// and, only when this tab's heart tap left the matching marker, save it and show it. A template
// missing from this page's list is still sent by id: the server decides whether it is live, and a
// refusal shows the notice. Signed out (the page is still streaming the session, or the visitor
// gave up on sign-in) it waits and leaves the address alone.
export function FavoriteReturn({ signedIn, find, onSaved }: Props) {
  const favorites = useFavorites()
  const done = useRef(false)
  useEffect(() => {
    if (!signedIn || !favorites || done.current) return
    const id = favoriteFromSearch(window.location.search)
    if (!id) return
    done.current = true
    window.history.replaceState(window.history.state, '', withoutFavorite(window.location.href))
    if (!takeFavoriteReturn(id)) return
    onSaved(id)
    // The picker and this lookup share one read. The server can still save by id if it fails.
    void find(id).catch(() => null).then((template) => {
      favorites.save(template ?? { id, category: '' }, 'home_picker')
    })
  }, [signedIn, favorites, find, onSaved])
  return null
}
