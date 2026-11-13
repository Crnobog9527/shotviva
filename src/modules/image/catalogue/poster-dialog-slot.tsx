'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'

import type { CreateContext } from '../workspace/create-dialog'
import type { CatalogueTemplate } from './catalogue-template'

// The poster editor's code is fetched once a poster template is first opened (scripts/js-budget.json).
const PosterDialog = dynamic(() => import('../poster/editor/poster-dialog').then((m) => m.PosterDialog), { ssr: false })

export const isPosterIn = (templates: readonly CatalogueTemplate[], id: string) => templates.some((item) => item.id === id && item.poster)

type Props = { id: string | null; templates: readonly CatalogueTemplate[]; onClose(): void; create: CreateContext }

// Create's poster editor dialog (ARCHITECTURE §5.3), asked for by ?poster=<id>. Once loaded it
// stays mounted, so closing it can play its motion.
export function PosterDialogSlot({ id, templates, onClose, create }: Props) {
  const [loaded, setLoaded] = useState(false)
  if (id && !loaded) setLoaded(true)
  if (!loaded) return null
  const summary = templates.find((item) => item.id === id) ?? null
  return <PosterDialog id={id} summary={summary} onClose={onClose} balance={create.balance} concurrency={create.concurrency.limit} />
}
