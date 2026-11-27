'use client'

import { useState } from 'react'

import { CASE_STRIP_MAX, type CaseStripEntry, type HomeCaseStrip } from '@/core/templates/home-case-strip'
import type { FeaturedBundles } from '@/core/templates/locale-display'
import { Button } from '@/core/ui/button'

import type { FeaturedBundleActions } from '../featured-bundles/types'
import type { CaseStripActions } from '../home-case-strip/types'
import { DISPLAY_LOCALES, type DisplayLocale } from '../locale-display/types'
import { useAdminAction } from '../shell/use-admin-action'
import type { AdminCategoryNode } from '../template-categories/types'
import type { AdminTemplate } from '../templates/types'
import type { BundleContext } from './bundle-dialog'
import { CASE_STRIP_COPY as COPY } from './case-strip-copy'
import { sameEntries } from './case-strip-draft'
import { CaseStripList } from './case-strip-list'
import { LOCALE_DISPLAY_COPY } from './copy'
import { featurable } from './display-state'
import { OwnBadge } from './rows'
import { useUnsavedGuard } from './use-unsaved-guard'

type Props = {
  strip: HomeCaseStrip
  templates: AdminTemplate[]
  categories: AdminCategoryNode[]
  // 精选组合 to add; undefined: none, or not readable now.
  bundles: FeaturedBundles | undefined
  actions: CaseStripActions
  saveBundle: FeaturedBundleActions['save']
  // One language only (a 首页展示 language page), with no language switch.
  locale?: DisplayLocale
}

// What a saved list can be saved again as: the server takes only published templates and
// existing bundles, so the ones that went away since are left out of the draft.
const stillThere = (list: readonly CaseStripEntry[], context: BundleContext) => list.filter((entry) => entry.kind === 'template'
  ? featurable(context.templates.find((template) => template.id === entry.id))
  : context.bundles.some((bundle) => bundle.id === entry.id))

const asValue = (result: { ok: true } | { ok: false; code: string; message: string }) => (result.ok ? { ok: true as const, value: undefined } : result)

// 首页「更多真实案例」 (Owner 2026-11-25): per language, up to eight templates or 精选组合 in the
// row under the home first screen. Read-only until 编辑; 保存 sends the language's whole list.
export function CaseStripPanel({ strip, templates, categories, bundles, actions, saveBundle, locale: only }: Props) {
  const [locale, setLocale] = useState<DisplayLocale>(only ?? 'zh')
  const [draft, setDraft] = useState<CaseStripEntry[] | null>(null)
  const { pending, error, notice, run } = useAdminAction()
  const context: BundleContext = { bundles: bundles?.list ?? [], templates, categories, save: saveBundle }
  const label = LOCALE_DISPLAY_COPY.locales[locale]
  const saved = strip[locale] ?? []
  const shown = draft ?? saved
  const dirty = draft !== null && !sameEntries(saved, draft)
  useUnsavedGuard(dirty, LOCALE_DISPLAY_COPY.confirmLeave)
  const switchTo = (code: DisplayLocale) => {
    if (code === locale || (dirty && !window.confirm(LOCALE_DISPLAY_COPY.confirmSwitch(label)))) return
    setDraft(null)
    setLocale(code)
  }
  const save = (list: CaseStripEntry[]) => run(async () => asValue(await actions.save({ locale, entries: list })), () => {
    setDraft(null)
    return COPY.saved(label)
  })
  return (
    <section aria-labelledby="case-strip-h" className="grid grid-cols-1 gap-3 rounded-md border p-4">
      <div className="grid grid-cols-1 max-w-prose gap-1">
        <h2 id="case-strip-h" className="font-medium">{COPY.title}</h2>
        <p className="text-sm text-muted-foreground">{COPY.body}</p>
      </div>
      <div role="tablist" aria-label={COPY.title} hidden={Boolean(only)} className="flex gap-2">
        {DISPLAY_LOCALES.map((code) => (
          <Button key={code} role="tab" aria-selected={code === locale} size="sm" disabled={pending}
            variant={code === locale ? 'default' : 'outline'} onClick={() => switchTo(code)}>{LOCALE_DISPLAY_COPY.locales[code]}</Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium">{label} · {COPY.count(shown.length, CASE_STRIP_MAX)}</h3>
        {saved.length ? <OwnBadge own /> : null}
        <EditActions draft={draft} pending={pending} dirty={dirty} setDraft={setDraft}
          onEdit={() => setDraft(stillThere(saved, context))} onSave={save} />
      </div>
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <CaseStripList locale={locale} label={label} list={shown} context={context} editing={draft !== null} onChange={setDraft} />
    </section>
  )
}

type ActionsProps = {
  draft: CaseStripEntry[] | null
  pending: boolean
  dirty: boolean
  setDraft: (draft: CaseStripEntry[] | null) => void
  onEdit: () => void
  onSave: (list: CaseStripEntry[]) => void
}

function EditActions({ draft, pending, dirty, setDraft, onEdit, onSave }: ActionsProps) {
  if (!draft) return <Button size="sm" variant="outline" className="ml-auto" onClick={onEdit}>{LOCALE_DISPLAY_COPY.edit}</Button>
  return (
    <div className="ml-auto flex gap-2">
      {draft.length ? <Button size="sm" variant="ghost" disabled={pending} onClick={() => setDraft([])}>{COPY.clear}</Button> : null}
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => setDraft(null)}>{LOCALE_DISPLAY_COPY.cancel}</Button>
      <Button size="sm" disabled={pending || !dirty} onClick={() => onSave(draft)}>{pending ? LOCALE_DISPLAY_COPY.saving : LOCALE_DISPLAY_COPY.save}</Button>
    </div>
  )
}
