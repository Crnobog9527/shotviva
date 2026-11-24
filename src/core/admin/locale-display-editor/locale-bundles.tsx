'use client'

import { BUNDLE_COPY as COPY } from './bundle-copy'
import type { BundleContext } from './bundle-dialog'
import { BundleList } from './bundle-list'
import { OwnBadge } from './rows'

type Props = {
  label: string
  // Own while the language has its own featured list (migration 2005).
  own: boolean
  ids: string[]
  context: BundleContext
  editing: boolean
  onChange: (ids: string[]) => void
}

// One language's 精选组合 in the 分语言展示 draft, saved with the same 保存.
export function LocaleBundles({ label, own, ids, context, editing, onChange }: Props) {
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium">{label} · {COPY.localeTitle}</h3>
        <OwnBadge own={own} />
      </div>
      <p className="text-xs text-muted-foreground">{own ? COPY.localeOwn : COPY.localeFollowing(ids.length)}</p>
      <BundleList ids={ids} context={context} editing={editing} onChange={onChange} />
    </div>
  )
}
