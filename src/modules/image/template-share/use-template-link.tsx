'use client'

import type { MouseEvent } from 'react'

import { Link } from '@/core/i18n/ui'
import { buttonVariants } from '@/core/ui/button'

import { useCollectionViewer } from './collection-viewer'

type Props = { templateId: string; label: string; className?: string }

// A template's "Use this template" on a collection page: its workspace, or the sign-up sheet for
// a visitor known to be signed out (collection-viewer.tsx).
export function UseTemplateLink({ templateId, label, className }: Props) {
  const { signedIn, signUpFor } = useCollectionViewer()
  const onClick = (event: MouseEvent) => {
    if (signedIn !== false) return
    event.preventDefault()
    signUpFor(templateId)
  }
  return (
    <Link
      href={`/generate/${encodeURIComponent(templateId)}`}
      prefetch={false}
      onClick={onClick}
      // Ghost, not the safelight primary: a collection has one per template (The One Primary Rule).
      className={buttonVariants({ variant: 'glass', size: 'touch', className: `w-full${className ? ` ${className}` : ''}` })}
    >
      {label}
    </Link>
  )
}
