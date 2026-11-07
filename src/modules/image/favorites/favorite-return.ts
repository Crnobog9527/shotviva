// Signed out, a heart goes to sign-in and back (ARCHITECTURE §5.1b): the page it was tapped on
// comes back with ?favorite=<template id>, saves that template once and drops the parameter.
// The tap also leaves a marker in this tab's sessionStorage, and only a return whose id matches
// it saves anything, so a crafted cross-site link with ?favorite= does nothing.

export const FAVORITE_PARAM = 'favorite'
const MARKER_KEY = 'shotviva.favorite-return'

type MarkerStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

// Storage can be missing or throw (private mode, blocked site data): then nothing is remembered
// and the return saves nothing, which is the safe side.
function sessionStore(): MarkerStore | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export function rememberFavoriteReturn(templateId: string, store: MarkerStore | null = sessionStore()): void {
  try {
    store?.setItem(MARKER_KEY, templateId)
  } catch {
    // Not remembered: the return will not save.
  }
}

// Whether this return was started by a heart tap in this tab for `templateId`. The marker is
// cleared either way, so it is used once.
export function takeFavoriteReturn(templateId: string, store: MarkerStore | null = sessionStore()): boolean {
  try {
    const marked = store?.getItem(MARKER_KEY) ?? null
    store?.removeItem(MARKER_KEY)
    return marked === templateId
  } catch {
    return false
  }
}

// The login page in the visitor's language (the i18n router adds the prefix), returning to
// `returnTo` (already in its language, e.g. '/zh') with the template to save.
export function signInForFavorite(returnTo: string, templateId: string): string {
  const back = new URL(returnTo, 'http://local.invalid')
  back.searchParams.set(FAVORITE_PARAM, templateId)
  return `/login?next=${encodeURIComponent(`${back.pathname}${back.search}`)}`
}

// The template id the page came back for, or null.
export function favoriteFromSearch(search: string): string | null {
  const id = new URLSearchParams(search).get(FAVORITE_PARAM)
  return id && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id) && id.length <= 64 ? id : null
}

// The same address without the parameter, for history.replaceState.
export function withoutFavorite(href: string): string {
  const url = new URL(href)
  url.searchParams.delete(FAVORITE_PARAM)
  return `${url.pathname}${url.search}${url.hash}`
}
