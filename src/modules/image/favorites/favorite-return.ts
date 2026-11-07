// Signed out, a heart goes to sign-in and back (ARCHITECTURE §5.1b): the page it was tapped on
// comes back with ?favorite=<template id>, saves that template once and drops the parameter.

export const FAVORITE_PARAM = 'favorite'

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
