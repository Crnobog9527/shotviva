'use client'

import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState, type ComponentProps } from 'react'

import type { HelpDialog } from './help-dialog'
import { HELP_PARAM, parseHelpParam } from './help-param'

const LazyHelpDialog = dynamic(() => import('./help-dialog').then(module => module.HelpDialog), { ssr: false })
type Props = ComponentProps<typeof HelpDialog>

function HelpWhenOpened(props: Props) {
  const requested = parseHelpParam(useSearchParams().get(HELP_PARAM)) !== null
  const [opened, setOpened] = useState(false)
  // Opening via the row, a deep link or Back all work through the existing ?help= route.
  // Keep the dialog mounted after the first visit for the close animation and drafts.
  if (requested && !opened) setOpened(true)
  return opened || requested ? <LazyHelpDialog {...props} /> : null
}

export function AccountHelp(props: Props) {
  return <Suspense fallback={null}><HelpWhenOpened {...props} /></Suspense>
}
