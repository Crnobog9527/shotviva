'use client'

import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect } from 'react'

import { HELP_PARAM, helpParamValue, parseHelpParam, type HelpView } from './help-param'

// The dialog's place lives in the URL (?help=…), so a reload, a shared link or an old
// /account/help address opens it where it was. Opening adds one history entry, marked in its
// state; moving inside the dialog replaces that entry; closing goes back over it. So the
// phone's Back button (and the browser's) closes the dialog instead of leaving the page.
// Next.js keeps useSearchParams in step with pushState / replaceState.

const MARK = 'svHelp'

function urlWith(view: HelpView | null): string {
  const url = new URL(window.location.href)
  if (view) url.searchParams.set(HELP_PARAM, helpParamValue(view))
  else url.searchParams.delete(HELP_PARAM)
  return `${url.pathname}${url.search}${url.hash}`
}

function ownsEntry(): boolean {
  const state: unknown = window.history.state
  return typeof state === 'object' && state !== null && MARK in state
}

// The Help & feedback row: opens the dialog over the account page.
export function openHelp(view: HelpView) {
  window.history.pushState({ [MARK]: true }, '', urlWith(view))
}

export function useHelpRoute() {
  const view = parseHelpParam(useSearchParams().get(HELP_PARAM))

  // Arrived with ?help= (a deep link, a reload, an old address): put the bare account page
  // underneath, so Back closes the dialog here too.
  const arrived = view !== null && !ownsEntry()
  useEffect(() => {
    if (!arrived) return
    const target = window.location.href
    window.history.replaceState(null, '', urlWith(null))
    window.history.pushState({ [MARK]: true }, '', target)
  }, [arrived])

  const go = useCallback((next: HelpView) => {
    window.history.replaceState({ [MARK]: true }, '', urlWith(next))
  }, [])

  const close = useCallback(() => {
    if (ownsEntry()) window.history.back()
    else window.history.replaceState(null, '', urlWith(null))
  }, [])

  return { view, go, close }
}
