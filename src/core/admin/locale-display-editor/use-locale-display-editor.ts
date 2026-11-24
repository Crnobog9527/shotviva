'use client'

import { useState, useTransition } from 'react'

import { NO_LOCALE_DISPLAY, type LocaleDisplay } from '@/core/templates/locale-display'

import type { DisplayLocale, LocaleDisplayActions } from '../locale-display/types'
import type { AdminCategoryNode } from '../template-categories/types'
import type { AdminTemplate } from '../templates/types'
import { LOCALE_DISPLAY_COPY as COPY } from './copy'
import { featuredState, siblingGroups } from './display-state'
import { draftChanges, hasChanges, sharedLists, toDraft, type LocaleDraft } from './draft'
import { useUnsavedGuard } from './use-unsaved-guard'

type Inputs = { categories: AdminCategoryNode[]; templates: AdminTemplate[]; display: LocaleDisplay; actions: LocaleDisplayActions }
export type SaveStatus = { kind: 'saved' | 'error'; text: string } | null

const FALLBACK = '保存失败，请稍后重试'

// Read-only until 编辑; then one language's draft that 保存 sends whole (one server call, all or
// nothing) and 取消 drops. Switching language or leaving with an unsaved draft asks first.
export function useLocaleDisplayEditor({ categories, templates, display, actions }: Inputs) {
  const [locale, setLocale] = useState<DisplayLocale>('en')
  const [edit, setEdit] = useState<{ locale: DisplayLocale; draft: LocaleDraft } | null>(null)
  const [status, setStatus] = useState<SaveStatus>(null)
  const [saving, startTransition] = useTransition()

  const groups = siblingGroups(categories, display, locale)
  const saved = toDraft(groups, featuredState(templates, display, locale))
  const shared = sharedLists(siblingGroups(categories, NO_LOCALE_DISPLAY, locale), featuredState(templates, NO_LOCALE_DISPLAY, locale))
  const draft = edit?.locale === locale ? edit.draft : null
  const changes = draft ? draftChanges(saved, draft) : null
  const dirty = changes !== null && hasChanges(changes)
  useUnsavedGuard(dirty, COPY.confirmLeave)

  const discard = (question: string) => {
    if (dirty && !window.confirm(question)) return false
    setEdit(null)
    return true
  }

  const save = () => {
    if (!changes || !dirty) return setEdit(null)
    setStatus(null)
    startTransition(async () => {
      const result = await actions.save({ locale, ...changes }).catch(() => ({ ok: false, message: FALLBACK }) as const)
      if (result.ok) {
        setEdit(null)
        setStatus({ kind: 'saved', text: COPY.saved(COPY.locales[locale]) })
      } else {
        setStatus({ kind: 'error', text: `${(result.message || FALLBACK).replace(/[。.]$/, '')}。${COPY.failed}` })
      }
    })
  }

  return {
    locale, groups, shared, saving, status, dirty,
    editing: draft !== null,
    shown: draft ?? saved,
    startEdit: () => {
      setStatus(null)
      setEdit({ locale, draft: saved })
    },
    update: (change: (current: LocaleDraft) => LocaleDraft) => setEdit((current) => current && { ...current, draft: change(current.draft) }),
    cancel: () => discard(COPY.confirmDiscard) && setStatus(null),
    switchTo: (code: DisplayLocale) => {
      if (code === locale || !discard(COPY.confirmSwitch(COPY.locales[locale]))) return
      setStatus(null)
      setLocale(code)
    },
    save,
  }
}

export type LocaleDisplayEditor = ReturnType<typeof useLocaleDisplayEditor>
