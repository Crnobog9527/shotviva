'use client'

import { Button } from '@/core/ui/button'

import { BUNDLE_COPY as COPY } from './bundle-copy'
import type { BundleContext } from './bundle-dialog'
import { BundleList } from './bundle-list'
import { LOCALE_DISPLAY_COPY } from './copy'
import type { DraftList } from './draft'
import { OwnBadge } from './rows'

type Props = {
  label: string
  list: DraftList
  context: BundleContext
  editing: boolean
  onChange: (ids: string[]) => void
  onReset: () => void
}

// One language's 精选组合 in the 分语言展示 draft, saved with the same 保存.
export function LocaleBundles({ label, list, context, editing, onChange, onReset }: Props) {
  return (
    <div className="grid grid-cols-1 gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium">{label} · {COPY.localeTitle}</h3>
        <OwnBadge own={list.own} />
        {editing && list.own ? <Button size="sm" variant="ghost" className="ml-auto" onClick={onReset}>{LOCALE_DISPLAY_COPY.reset}</Button> : null}
      </div>
      <p className="text-xs text-muted-foreground">{list.own ? COPY.localeOwn : COPY.localeFollowing(list.ids.length)}</p>
      <BundleList ids={list.ids} context={context} editing={editing} onChange={onChange} />
    </div>
  )
}
