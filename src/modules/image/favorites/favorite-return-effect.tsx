'use client'

import { useEffect, useRef } from 'react'

import { favoriteFromSearch, withoutFavorite } from './favorite-return'
import { useFavorites } from './favorites-provider'

type Props = {
  signedIn: boolean
  templates: readonly { id: string; category: string }[]
  // Shows the template that was just saved (the home picker opens on it).
  onSaved(id: string): void
}

// Back from sign-in with ?favorite=<id> (ARCHITECTURE §5.1b): save it once, take the parameter
// off the address and show it. Signed out (the page is still streaming the session, or the
// visitor gave up on sign-in) it waits and leaves the address alone.
export function FavoriteReturn({ signedIn, templates, onSaved }: Props) {
  const favorites = useFavorites()
  const done = useRef(false)
  useEffect(() => {
    if (!signedIn || !favorites || done.current) return
    const id = favoriteFromSearch(window.location.search)
    if (!id) return
    done.current = true
    window.history.replaceState(window.history.state, '', withoutFavorite(window.location.href))
    const template = templates.find((candidate) => candidate.id === id)
    if (!template) return
    favorites.save(template, 'home_picker')
    onSaved(id)
  }, [signedIn, favorites, templates, onSaved])
  return null
}
