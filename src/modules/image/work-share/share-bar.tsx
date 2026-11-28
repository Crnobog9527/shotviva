'use client'

import dynamic from 'next/dynamic'

import { useShareSelect } from './select-context'
import type { BulkDeleteAction, CreateShareAction } from './share-types'

// The bar and its dialog load once select mode starts, not with Photos (scripts/js-budget.json).
const ShareBarBody = dynamic(() => import('./share-bar-body').then((mod) => mod.ShareBarBody), { ssr: false })

export function ShareBar({ create, remove }: { create: CreateShareAction; remove?: BulkDeleteAction }) {
  return useShareSelect()?.selecting ? <ShareBarBody create={create} remove={remove} /> : null
}
