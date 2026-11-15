'use client'

import { useRef, useState } from 'react'

import type { PosterContent, PosterFields } from '@/core/poster'

import { firstFoldKey } from './block-folds'
import { flagStops, nextFlag, type FlagCursor } from './flag-stops'
import { drawAttention, flaggedFields } from './flag-attention'
import { pageGroups } from './page-groups'

// Which tab of the editor is showing and which parts are open (the first of each tab to start
// with), held above the form so 去核对, next to the checkbox and next to 生成, can open the part
// with the next yellow line, bring it into view and draw the eye to it.
export function useBlockNav(poster: PosterFields) {
  const [current, setCurrent] = useState(() => pageGroups(poster)[0]?.key ?? 'shared')
  const [open, setOpen] = useState<string[]>(() => pageGroups(poster).flatMap((group) => {
    const first = firstFoldKey(group.blocks)
    return first ? [`${group.key}:${first}`] : []
  }))
  const cursor = useRef<FlagCursor | null>(null)

  function jump(content: PosterContent, unverified: readonly string[]) {
    const before = cursor.current
    const next = nextFlag(flagStops(poster, content, unverified), before, before ? flaggedFields(before.fold)?.length ?? null : null)
    if (!next) return
    cursor.current = { fold: next.fold, field: next.field }
    setCurrent(next.group)
    setOpen((ids) => (ids.includes(next.fold) ? ids : [...ids, next.fold]))
    // After React has shown the tab and opened the part.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const fields = flaggedFields(next.fold) ?? []
      const field = fields[Math.min(next.field, fields.length - 1)]
      if (field) drawAttention(field)
    }))
  }

  return {
    current, choose: setCurrent, open,
    toggle: (id: string) => setOpen((ids) => (ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id])),
    reveal: (id: string) => setOpen((ids) => (ids.includes(id) ? ids : [...ids, id])),
    jump,
  }
}

export type BlockNav = ReturnType<typeof useBlockNav>
