'use client'

import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect } from 'react'

import { HELP_PARAM, parseHelpParam, type HelpView } from './help-param'
import { arriveIn, browserHistory, closeIn, goIn, openIn } from './help-history'

// The dialog's place lives in the URL (?help=…), so a reload, a shared link or an old
// /account/help address opens it where it was; help-history.ts says how Back closes it.
// Next.js keeps useSearchParams in step with pushState / replaceState.

// The Help & feedback row: opens the dialog over the account page.
export function openHelp(view: HelpView) {
  openIn(browserHistory, view)
}

export function useHelpRoute() {
  const view = parseHelpParam(useSearchParams().get(HELP_PARAM))

  // History exists only in the browser, hence the effect.
  const open = view !== null
  useEffect(() => (open ? arriveIn(browserHistory) : undefined), [open])

  const go = useCallback((next: HelpView) => goIn(browserHistory, next), [])
  const close = useCallback(() => closeIn(browserHistory), [])

  return { view, go, close }
}
