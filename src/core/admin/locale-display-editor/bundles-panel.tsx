'use client'

import { Plus } from 'lucide-react'
import { useState } from 'react'

import type { FeaturedBundle } from '@/core/templates/locale-display'
import { Button } from '@/core/ui/button'

import type { FeaturedBundleActions } from '../featured-bundles/types'
import { useAdminAction } from '../shell/use-admin-action'
import type { AdminCategoryNode } from '../template-categories/types'
import { zhNameOf } from '../templates-editor/featured-card'
import type { AdminTemplate } from '../templates/types'
import { BUNDLE_COPY as COPY } from './bundle-copy'
import { BundleDialog, type BundleContext } from './bundle-dialog'
import { BundleList } from './bundle-list'

type Props = {
  bundles: FeaturedBundle[]
  templates: AdminTemplate[]
  categories: AdminCategoryNode[]
  actions: FeaturedBundleActions
  // 首页展示 shows the two halves on different tabs (Owner 2026-11-27): 'library' the bundles
  // themselves (组合库), 'default' only which of them the default 首页精选 shows. Both when absent.
  show?: 'library' | 'default'
}

const asValue = <T,>(result: { ok: true } | { ok: false; code: string; message: string }) =>
  (result.ok ? { ok: true as const, value: undefined as T } : result)

// 精选组合 (Owner 2026-11-25): every bundle (新建, 编辑, 删除 save at once) and which of them the
// default 首页精选 shows, arranged first and saved with one 保存 like the other lists.
export function BundlesPanel({ bundles, templates, categories, actions, show }: Props) {
  const { pending, error, notice, run } = useAdminAction()
  const context: BundleContext = { bundles, templates, categories, save: actions.save }
  if (show === 'default') {
    return (
      <section aria-label={COPY.defaultTitle} className="grid grid-cols-1 gap-2 rounded-md border p-4">
        <DefaultBundles context={context} saved={defaultIds(bundles)} setDefault={actions.setDefault} />
      </section>
    )
  }
  const remove = (bundle: FeaturedBundle) => {
    if (!window.confirm(COPY.confirmRemove(bundle.nameZh))) return
    run(async () => asValue(await actions.remove(bundle.id)), () => COPY.removed)
  }
  return (
    <section aria-labelledby="bundles-h" className="grid grid-cols-1 gap-4 rounded-md border p-4">
      <div className="grid grid-cols-1 max-w-prose gap-1">
        <h2 id="bundles-h" className="font-medium">{COPY.panelTitle}</h2>
        <p className="text-sm text-muted-foreground">{show === 'library' ? COPY.libraryBody : COPY.panelBody}</p>
      </div>
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {bundles.length === 0 ? <p className="text-sm text-muted-foreground">{COPY.none}</p> : null}
      <ul className="grid grid-cols-1 gap-1.5">
        {bundles.map((bundle) => (
          <li key={bundle.id} className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2">
            <span className="grid grid-cols-1 min-w-0 flex-1 gap-0.5">
              <span className="truncate text-sm font-medium">{bundle.nameZh} <span className="font-normal text-muted-foreground">/ {bundle.nameEn}</span></span>
              <span className="truncate text-xs text-muted-foreground">
                {COPY.members(bundle.templateIds.length)}：{bundle.templateIds.map((id) => zhNameOf(templates.find((template) => template.id === id), id)).join('、')}
              </span>
            </span>
            <BundleDialog context={context} bundle={bundle} trigger={(open) => <Button size="sm" variant="ghost" disabled={pending} onClick={open}>{COPY.edit}</Button>} />
            <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" disabled={pending} onClick={() => remove(bundle)}>{COPY.remove}</Button>
          </li>
        ))}
      </ul>
      <BundleDialog context={context} trigger={(open) => <Button size="sm" variant="outline" className="justify-self-start" onClick={open}><Plus aria-hidden />{COPY.create}</Button>} />
      {show === 'library' ? null : <DefaultBundles context={context} saved={defaultIds(bundles)} setDefault={actions.setDefault} />}
    </section>
  )
}

const defaultIds = (bundles: readonly FeaturedBundle[]) =>
  bundles.filter((bundle) => bundle.featuredRank !== null).sort((a, b) => (a.featuredRank ?? 0) - (b.featuredRank ?? 0)).map((bundle) => bundle.id)

type DefaultProps = { context: BundleContext; saved: string[]; setDefault: FeaturedBundleActions['setDefault'] }

function DefaultBundles({ context, saved, setDefault }: DefaultProps) {
  const [draft, setDraft] = useState<string[] | null>(null)
  const { pending, error, notice, run } = useAdminAction()
  const save = (ids: string[]) => run(async () => asValue(await setDefault(ids)), () => {
    setDraft(null)
    return COPY.defaultSaved
  })
  return (
    <div className="grid grid-cols-1 gap-2 border-t pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium">{COPY.defaultTitle}</h3>
        <div className="ml-auto flex gap-2">
          {draft ? (
            <>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => setDraft(null)}>{COPY.cancelList}</Button>
              <Button size="sm" disabled={pending} onClick={() => save(draft)}>{COPY.saveList}</Button>
            </>
          ) : <Button size="sm" variant="outline" onClick={() => setDraft(saved)}>{COPY.editList}</Button>}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{COPY.defaultHint}</p>
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {(draft ?? saved).length === 0 && !draft ? <p className="text-sm text-muted-foreground">{COPY.defaultEmpty}</p> : null}
      <BundleList ids={draft ?? saved} context={context} editing={draft !== null} onChange={setDraft} />
    </div>
  )
}
