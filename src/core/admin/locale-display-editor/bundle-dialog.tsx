'use client'

import { X } from 'lucide-react'
import { useState, useTransition, type ReactNode } from 'react'

import type { FeaturedBundle } from '@/core/templates/locale-display'
import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/core/ui/dialog'
import { Input } from '@/core/ui/input'

import { BUNDLE_MAX, BUNDLE_MIN, type FeaturedBundleActions } from '../featured-bundles/types'
import type { AdminCategoryNode } from '../template-categories/types'
import { zhNameOf } from '../templates-editor/featured-card'
import type { AdminTemplate } from '../templates/types'
import { BUNDLE_COPY as COPY } from './bundle-copy'
import { PickerBody } from './featured-picker'

export type BundleContext = {
  bundles: FeaturedBundle[]
  templates: AdminTemplate[]
  categories: AdminCategoryNode[]
  save: FeaturedBundleActions['save']
}

type Props = {
  context: BundleContext
  // The bundle to edit; absent: a new one.
  bundle?: FeaturedBundle
  // The button that opens the window.
  trigger: (open: () => void) => ReactNode
  onSaved?: (id: string) => void
}

const FALLBACK = '保存失败，请稍后重试'

// 新建组合 / 编辑: names in both languages and 2-8 templates picked from the same cover grid as
// 添加精选模板, in tick order. Saved at once (a bundle is its own record, not part of a draft).
export function BundleDialog({ context, bundle, trigger, onSaved }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger(() => setOpen(true))}
      <DialogContent className="flex max-h-[92dvh] flex-col gap-3 p-4 sm:max-w-5xl sm:p-6">
        <DialogHeader>
          <DialogTitle>{bundle ? COPY.dialogEdit : COPY.dialogNew}</DialogTitle>
          <DialogDescription>{COPY.dialogBody}</DialogDescription>
        </DialogHeader>
        {open ? <BundleForm context={context} bundle={bundle} close={() => setOpen(false)} onSaved={onSaved} /> : null}
      </DialogContent>
    </Dialog>
  )
}

type FormProps = { context: BundleContext; bundle?: FeaturedBundle; close: () => void; onSaved?: (id: string) => void }

const isReady = (nameZh: string, nameEn: string, count: number) =>
  Boolean(nameZh.trim() && nameEn.trim()) && count >= BUNDLE_MIN && count <= BUNDLE_MAX

function useBundleForm({ context, bundle, close, onSaved }: FormProps) {
  const [nameZh, setNameZh] = useState(bundle?.nameZh ?? '')
  const [nameEn, setNameEn] = useState(bundle?.nameEn ?? '')
  const [picked, setPicked] = useState<string[]>(bundle?.templateIds ?? [])
  const [error, setError] = useState<string | null>(null)
  const [saving, startTransition] = useTransition()
  const save = () => startTransition(async () => {
    setError(null)
    const result = await context.save({ id: bundle?.id ?? null, nameEn, nameZh, templateIds: picked })
      .catch(() => ({ ok: false, message: FALLBACK }) as const)
    if (!result.ok) return setError(result.message || FALLBACK)
    onSaved?.(result.value)
    close()
  })
  return { nameZh, setNameZh, nameEn, setNameEn, picked, setPicked, error, saving, save, ready: isReady(nameZh, nameEn, picked.length) }
}

function BundleForm(props: FormProps) {
  const { context, close } = props
  const { nameZh, setNameZh, nameEn, setNameEn, picked, setPicked, error, saving, save, ready } = useBundleForm(props)
  return (
    <>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">{COPY.nameZh}<Input value={nameZh} maxLength={80} placeholder={COPY.nameZhHint} onChange={(event) => setNameZh(event.target.value)} /></label>
        <label className="grid gap-1 text-sm">{COPY.nameEn}<Input value={nameEn} maxLength={80} placeholder={COPY.nameEnHint} onChange={(event) => setNameEn(event.target.value)} /></label>
      </div>
      <PickedChips picked={picked} templates={context.templates} onRemove={(id) => setPicked((current) => current.filter((other) => other !== id))} />
      <PickerBody locale="zh" templates={context.templates} categories={context.categories} taken={[]} picked={picked} setPicked={setPicked} max={BUNDLE_MAX} />
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter className="flex-row flex-wrap items-center gap-2 sm:justify-between">
        <span className="text-sm text-muted-foreground">{COPY.picked(picked.length, BUNDLE_MAX)}</span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" disabled={saving} onClick={close}>{COPY.cancel}</Button>
          <Button size="sm" disabled={!ready || saving} onClick={save}>{saving ? COPY.saving : COPY.save}</Button>
        </div>
      </DialogFooter>
    </>
  )
}

function PickedChips({ picked, templates, onRemove }: { picked: string[]; templates: AdminTemplate[]; onRemove: (id: string) => void }) {
  if (picked.length === 0) return null
  const nameOf = (id: string) => zhNameOf(templates.find((template) => template.id === id), id)
  return (
    <ol className="flex flex-wrap gap-1.5">
      {picked.map((id, index) => (
        <li key={id} className="flex items-center gap-1 rounded-full border py-0.5 pr-0.5 pl-2.5 text-xs">
          <span className="tabular-nums text-muted-foreground">{index + 1}</span>{nameOf(id)}
          <Button variant="ghost" size="icon-sm" className="size-5" aria-label={COPY.removePick(nameOf(id))} onClick={() => onRemove(id)}><X aria-hidden /></Button>
        </li>
      ))}
    </ol>
  )
}
