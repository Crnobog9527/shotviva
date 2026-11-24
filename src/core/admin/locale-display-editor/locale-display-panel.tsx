'use client'

import { ChevronDown } from 'lucide-react'

import type { LocaleDisplay } from '@/core/templates/locale-display'
import { Button } from '@/core/ui/button'
import { cn } from '@/core/ui/cn'

import { DISPLAY_LOCALES, type LocaleDisplayActions } from '../locale-display/types'
import type { AdminCategoryNode } from '../template-categories/types'
import type { AdminTemplate } from '../templates/types'
import { CategoryGroups } from './category-groups'
import { LOCALE_DISPLAY_COPY as COPY } from './copy'
import { featuredState, siblingGroups } from './display-state'
import type { FeaturedBundleActions } from '../featured-bundles/types'
import { groupKey, reorderGroup, resetBundles, resetFeatured, resetGroup, setBundles, setFeatured } from './draft'
import { LocaleBundles } from './locale-bundles'
import { EditBar } from './edit-bar'
import { FeaturedList } from './featured-list'
import { usePanelOpen } from './use-panel-open'
import { useLocaleDisplayEditor } from './use-locale-display-editor'

type Props = {
  categories: AdminCategoryNode[]
  templates: AdminTemplate[]
  display: LocaleDisplay
  actions: LocaleDisplayActions
  // 精选组合: making one from the 分语言展示 draft saves it at once.
  saveBundle: FeaturedBundleActions['save']
}

// 分语言展示: the home page's category groups, Create's category bar and the home featured list
// (and the generator rail under it), set separately for the English and the Chinese site. Closed
// and read-only by default (Owner 2026-11-25); 编辑 opens a draft for one language that 保存
// applies in one go. Closing only hides the body, so an open draft survives it.
export function LocaleDisplayPanel({ categories: all, templates, display, actions, saveBundle }: Props) {
  const [open, setOpen] = usePanelOpen()
  const categories = all.filter((category) => !category.isSystem)
  const summary = DISPLAY_LOCALES.map((code) => COPY.summary(COPY.locales[code],
    siblingGroups(categories, display, code).filter((group) => group.own).length, featuredState(templates, display, code).own,
    (display.bundles?.locale[code] ?? []).length > 0)).join('；')
  return (
    <section aria-labelledby="locale-display-h" className="grid gap-4 rounded-md border p-4">
      <h2 id="locale-display-h" className="font-medium">
        <button type="button" aria-expanded={open} aria-controls="locale-display-body" title={open ? COPY.collapse : COPY.expand}
          className="-m-1 flex w-full items-start gap-2 rounded-md p-1 text-left hover:bg-muted/50" onClick={() => setOpen(!open)}>
          <ChevronDown aria-hidden className={cn('mt-1 size-4 shrink-0 transition-transform', open ? '' : '-rotate-90')} />
          <span className="grid min-w-0 gap-0.5">
            <span>{COPY.title}</span>
            <span className="text-sm font-normal text-muted-foreground">{summary}</span>
          </span>
        </button>
      </h2>
      <PanelBody hidden={!open} categories={categories} templates={templates} display={display} actions={actions} saveBundle={saveBundle} />
    </section>
  )
}

function PanelBody({ hidden, categories, templates, display, actions, saveBundle }: Props & { hidden: boolean }) {
  const editor = useLocaleDisplayEditor({ categories, templates, display, actions })
  const { locale, shown, shared, update } = editor
  const label = COPY.locales[locale]
  const nameOf = (key: string) => categories.find((category) => category.key === key)?.nameZh ?? key
  const bundleContext = { bundles: display.bundles?.list ?? [], templates, categories, save: saveBundle }
  return (
    <div id="locale-display-body" hidden={hidden} className="grid gap-4">
      <p className="max-w-prose text-sm text-muted-foreground">{COPY.body}</p>
      <div role="tablist" aria-label={COPY.title} className="flex gap-2">
        {DISPLAY_LOCALES.map((code) => (
          <Button key={code} role="tab" aria-selected={code === locale} size="sm" disabled={editor.saving}
            variant={code === locale ? 'default' : 'outline'} onClick={() => editor.switchTo(code)}>
            {COPY.locales[code]}
          </Button>
        ))}
      </div>
      {editor.editing ? null : <EditBar editor={editor} label={label} />}
      <CategoryGroups label={label} groups={editor.groups} nameOf={nameOf} editing={editor.editing}
        listOf={(parent) => shown.groups[groupKey(parent)] ?? { own: false, ids: [] }}
        onReorder={(parent, keys) => update((draft) => reorderGroup(draft, parent, keys))}
        onReset={(parent) => update((draft) => resetGroup(draft, parent, shared))} />
      <FeaturedList locale={locale} label={label} list={shown.featured} templates={templates} categories={categories} editing={editor.editing}
        onChange={(ids) => update((draft) => setFeatured(draft, ids, shared))}
        onReset={() => update((draft) => resetFeatured(draft, shared))} />
      <LocaleBundles label={label} list={shown.bundles} context={bundleContext} editing={editor.editing}
        onChange={(ids) => update((draft) => setBundles(draft, ids, shared))} onReset={() => update((draft) => resetBundles(draft, shared))} />
      {editor.editing ? <EditBar editor={editor} label={label} /> : null}
    </div>
  )
}
