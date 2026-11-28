'use client'

import dynamic from 'next/dynamic'

import { useShareSelect } from './select-context'
import type { BulkDeleteAction, CreateShareAction } from './share-types'

// The bar and its dialog load once select mode starts, not with Photos (scripts/js-budget.json).
const ShareBarBody = dynamic(() => import('./share-bar-body').then((mod) => mod.ShareBarBody), { ssr: false })

// The props go through as they are: this file rides in Photos' first load, the body does not.
export const ShareBar = (props: { create: CreateShareAction; remove?: BulkDeleteAction }) => (useShareSelect()?.selecting ? <ShareBarBody {...props} /> : null)
