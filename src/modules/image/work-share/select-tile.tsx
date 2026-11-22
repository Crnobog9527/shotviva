'use client'

import dynamic from 'next/dynamic'

import { useShareSelect } from './select-context'

// The pick button loads once select mode starts, not with Photos (scripts/js-budget.json).
const SelectTileButton = dynamic(() => import('./select-tile-button').then((mod) => mod.SelectTileButton), { ssr: false })

export function SelectTile({ jobId, name }: { jobId: string; name: string }) {
  return useShareSelect()?.selecting ? <SelectTileButton jobId={jobId} name={name} /> : null
}
