'use client'

import { useState } from 'react'

import { DEFAULT_HERO_SCOPE, HERO_SCENES_MAX, HERO_SCOPES, type HeroSceneEntry, type HeroScope, type HomeHeroSettings } from '@/core/templates/home-hero'
import { Button } from '@/core/ui/button'

import type { HomeHeroActions } from '../home-hero/types'
import { useAdminAction } from '../shell/use-admin-action'
import type { AdminCategoryNode } from '../template-categories/types'
import type { AdminTemplate } from '../templates/types'
import { LOCALE_DISPLAY_COPY } from './copy'
import { featurable } from './display-state'
import { HERO_COPY as COPY } from './hero-copy'
import { sameScenes } from './hero-draft'
import { HeroList } from './hero-list'
import { OwnBadge } from './rows'
import { useUnsavedGuard } from './use-unsaved-guard'

// scope: one scope only (a 首页展示 tab), with no scope switch.
type Props = { hero: HomeHeroSettings; templates: AdminTemplate[]; categories: AdminCategoryNode[]; actions: HomeHeroActions; scope?: HeroScope }

// A language's tab: its site name when the admin copy has one (英文站, 中文站), else the language's
// Chinese name, so a language added to the site shows up here with no change.
const languageName = new Intl.DisplayNames(['zh-Hans'], { type: 'language' })
const scopeLabel = (scope: HeroScope) => scope === DEFAULT_HERO_SCOPE
  ? COPY.scopeDefault
  : (LOCALE_DISPLAY_COPY.locales as Record<string, string>)[scope] ?? `${languageName.of(scope) ?? scope}站`

const asValue = (result: { ok: true } | { ok: false; code: string; message: string }) => (result.ok ? { ok: true as const, value: undefined } : result)

// 首页首屏大图 (Owner 2026-11-25): per scope (默认 and each site language), one to six templates for
// the pair beside the home H1. Read-only until 编辑; 保存 sends the scope's whole list.
export function HeroPanel({ hero, templates, categories, actions, scope: only }: Props) {
  const [scope, setScope] = useState<HeroScope>(only ?? DEFAULT_HERO_SCOPE)
  const [draft, setDraft] = useState<HeroSceneEntry[] | null>(null)
  const { pending, error, notice, run } = useAdminAction()
  const label = scopeLabel(scope)
  const saved = hero[scope] ?? []
  const shown = draft ?? saved
  const dirty = draft !== null && !sameScenes(saved, draft)
  useUnsavedGuard(dirty, COPY.confirmLeave)
  const switchTo = (next: HeroScope) => {
    if (next === scope || (dirty && !window.confirm(COPY.confirmSwitch(label)))) return
    setDraft(null)
    setScope(next)
  }
  const save = (list: HeroSceneEntry[]) => run(async () => asValue(await actions.save({ scope, entries: list })), () => {
    setDraft(null)
    return COPY.saved(label)
  })
  // Templates taken down since the last save would be refused; they leave the draft.
  const startEdit = () => setDraft(saved.filter((entry) => featurable(templates.find((one) => one.id === entry.templateId))))
  return (
    <section aria-labelledby="home-hero-h" className="grid grid-cols-1 gap-3 rounded-md border p-4">
      <div className="grid grid-cols-1 max-w-prose gap-1">
        <h2 id="home-hero-h" className="font-medium">{COPY.title}</h2>
        <p className="text-sm text-muted-foreground">{COPY.body}</p>
      </div>
      <div role="tablist" aria-label={COPY.title} hidden={Boolean(only)} className="flex flex-wrap gap-2">
        {HERO_SCOPES.map((code) => (
          <Button key={code} role="tab" aria-selected={code === scope} size="sm" disabled={pending}
            variant={code === scope ? 'default' : 'outline'} onClick={() => switchTo(code)}>{scopeLabel(code)}</Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium">{label} · {COPY.count(shown.length, HERO_SCENES_MAX)}{shown.length ? ` · ${COPY.mode(shown.length)}` : ''}</h3>
        {scope === DEFAULT_HERO_SCOPE ? null : <OwnBadge own={shown.length > 0} />}
        <EditActions draft={draft} pending={pending} dirty={dirty} setDraft={setDraft} onEdit={startEdit} onSave={save} />
      </div>
      <p className="text-xs text-muted-foreground"><ScopeHint scope={scope} count={shown.length} defaults={(hero[DEFAULT_HERO_SCOPE] ?? []).length} /></p>
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <HeroList scope={scope} label={label} list={shown} templates={templates} categories={categories} editing={draft !== null} onChange={setDraft} />
    </section>
  )
}

function ScopeHint({ scope, count, defaults }: { scope: HeroScope; count: number; defaults: number }) {
  if (scope === DEFAULT_HERO_SCOPE) return <>{count ? COPY.defaultOwn : COPY.builtIn}</>
  return <>{count ? COPY.own : COPY.followingDefault(defaults)}</>
}

type ActionsProps = {
  draft: HeroSceneEntry[] | null
  pending: boolean
  dirty: boolean
  setDraft: (draft: HeroSceneEntry[] | null) => void
  onEdit: () => void
  onSave: (list: HeroSceneEntry[]) => void
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
