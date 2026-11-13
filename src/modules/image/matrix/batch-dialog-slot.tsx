'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'

import type { CatalogueTemplate } from '../catalogue/catalogue-template'
import { batchCaps } from '../gated/feature-access'
import type { CreateContext } from '../workspace/create-dialog'
import { closeBatch, useBatchQuery } from './batch-query'

// The dialog (form, grid, results, ZIP) and the guide are their own chunks, fetched the first
// time Batch create opens or its card is touched, never in Create's first load
// (scripts/js-budget.json).
const loadDialog = () => import('./batch-dialog').then((m) => m.BatchDialog)
const BatchDialog = dynamic(loadDialog, { ssr: false })
const FeatureGuide = dynamic(() => import('../gated/feature-intro').then((m) => m.FeatureGuide), { ssr: false })

export const preloadBatchDialog = () => void loadDialog()

type Props = { templates: readonly CatalogueTemplate[]; create: CreateContext }

// Where Batch create lives on Create: opened by ?batch=1 (the card, a template's "Use Batch
// create", a workspace's link, a refresh with it open). Below Pro the same address opens the
// intro that leads to the paywall on Pro instead (the card itself never sends them here).
export function BatchDialogSlot({ templates, create }: Props) {
  const query = useBatchQuery()
  // Once opened it stays mounted, so closing plays its motion and keeps the draft.
  const [mounted, setMounted] = useState(query.open)
  if (query.open && !mounted) setMounted(true)
  if (!mounted) return null
  if (!batchCaps(create.tier)) {
    return <FeatureGuide tab="batch" tier={create.tier} upgrade="pro" open={query.open} onOpenChange={(open) => !open && closeBatch()} />
  }
  return (
    <BatchDialog
      open={query.open}
      onClose={closeBatch}
      requested={query.templateIds}
      templates={templates}
      balance={create.balance}
      tier={create.tier}
      limit={create.concurrency.limit}
    />
  )
}
