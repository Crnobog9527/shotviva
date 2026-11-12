'use client'

import { useEffect, useEffectEvent, useRef } from 'react'

import { useStoredExpanded, writeExpanded } from './expanded-store'
import { parentKeys, parseExpanded, revealPath, type TreeItem } from './tree'

export type Expansion = {
  expanded: ReadonlySet<string>
  parents: ReadonlySet<string>
  toggle: (key: string) => void
  reveal: (key: string | null) => void
  setAll: (open: boolean) => void
}

// Which branches are open (all collapsed until the admin opens one), remembered per tree. A category
// added under a collapsed parent opens that branch, so the new row is in view after the refresh.
export function useExpansion(storageKey: string, ordered: readonly TreeItem[]): Expansion {
  const parents = parentKeys(ordered)
  const expanded = parseExpanded(useStoredExpanded(storageKey), parents)
  const write = (keys: Iterable<string>) => writeExpanded(storageKey, keys)
  const reveal = (key: string | null) => write([...expanded, ...revealPath(ordered, key)])

  const known = useRef<Set<string> | null>(null)
  const keys = ordered.map(node => node.key).join('\n')
  const revealAdded = useEffectEvent((added: string[]) => {
    const path = added.flatMap(key => revealPath(ordered, ordered.find(node => node.key === key)?.parentId ?? null))
    if (path.length) write([...expanded, ...path])
  })
  useEffect(() => {
    const current = new Set(keys.split('\n'))
    const before = known.current
    known.current = current
    if (before) revealAdded([...current].filter(key => !before.has(key)))
  }, [keys])

  return {
    expanded,
    parents,
    toggle: key => write(expanded.has(key) ? [...expanded].filter(open => open !== key) : [...expanded, key]),
    reveal,
    setAll: open => write(open ? parents : []),
  }
}
