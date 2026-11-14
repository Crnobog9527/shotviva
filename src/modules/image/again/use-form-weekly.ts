'use client'

import { useEffect, useRef, useState } from 'react'

import { copyConflicts, fillCopy, matchesStore, storeCopyValues } from '@/core/store-profile'

import { isSlotTemplate, type CatalogueTemplate } from '../catalogue/catalogue-template'
import type { WorkspaceDraft } from '../workspace/use-workspace-draft'
import { againValues } from './again-start'
import type { WeeklyPeek } from './weekly'
import { fetchLastIssue, fetchWeeklyPeek, turnAutofillOff } from './weekly-api'

// 每周复用 in the creation dialog (§5.3), for templates whose text is redone every week, such as
// the prize posters: 用上一期 fills every field, size and photo box from this account's newest
// work of the template (or of another style in its series); 店铺信息 fills the empty store fields
// as the dialog opens. Typed values are only replaced after a yes.

// Templates this applies to: text fields the store fills, or text grouped into sections (§5.1e-2).
export const weeklyApplies = (template: CatalogueTemplate): boolean =>
  template.copyFields.length > 0 && (matchesStore(template.copyFields) || (template.groups?.length ?? 0) > 0)

type Reused = { madeAt: string; templateId: string }
const asText = (copy: Record<string, string>) => JSON.stringify(Object.entries(copy).filter(([, value]) => value.trim()).sort())

function usePeek(ids: readonly string[], enabled: boolean) {
  const [peek, setPeek] = useState<WeeklyPeek | null>(null)
  const key = ids.join(',')
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    const [first, ...rest] = key.split(',')
    void fetchWeeklyPeek(first!, rest, controller.signal).then((value) => { if (!controller.signal.aborted) setPeek(value) })
    return () => controller.abort()
  }, [key, enabled])
  return enabled ? peek : null
}

// `ids`: the template's id first, then its series' other styles.
export function useFormWeekly(template: CatalogueTemplate, draft: WorkspaceDraft, ids: readonly string[]) {
  const peek = usePeek(ids, weeklyApplies(template))
  const store = peek?.store ?? null
  const [filled, setFilled] = useState<Record<string, string> | null>(null)
  const [autofill, setAutofill] = useState(true)
  const [reused, setReused] = useState<Reused | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const baseline = useRef<string | null>(null)
  const copy = draft.values.copy
  const values = store ? storeCopyValues(template.copyFields, store) : {}

  const fill = (force: boolean) => {
    const next = fillCopy(copy, values, force)
    if (next.changed.length) { draft.change({ copy: next.copy }); setFilled(copy) }
    return next.copy
  }

  useEffect(() => {
    if (!peek || baseline.current !== null) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the store details arrive after mount
    baseline.current = asText(store?.autofill ? fill(false) : copy)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the peek is in
  }, [peek])

  async function takeLast() {
    setBusy(true)
    setFailed(false)
    const issue = await fetchLastIssue(ids[0]!, ids.slice(1))
    setBusy(false)
    if (!issue || issue.kind !== 'form') return setFailed(true)
    draft.change(againValues(issue.inputs, template))
    const slots = new Set((template.imageSlots ?? []).map((slot) => slot.key))
    if (isSlotTemplate(template)) for (const photo of issue.photos) if (photo.slot && slots.has(photo.slot)) draft.slots.restore({ ...photo, slot: photo.slot }, issue.madeAt)
    setReused({ madeAt: issue.madeAt, templateId: issue.templateId })
    setFilled(null)
  }

  return {
    peek, store, reused, busy, failed, filled: filled !== null, autofill: autofill && Boolean(store?.autofill), takeLast,
    dirty: () => baseline.current !== null && asText(copy) !== baseline.current,
    conflicts: () => copyConflicts(copy, values).length > 0,
    fill: () => void fill(true),
    undo: () => { if (filled) draft.change({ copy: filled }); setFilled(null) },
    autofillOff: () => { setAutofill(false); void turnAutofillOff(ids[0]!) },
  }
}

export type FormWeekly = ReturnType<typeof useFormWeekly>
