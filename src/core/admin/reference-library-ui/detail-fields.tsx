import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'
import { Textarea } from '@/core/ui/textarea'
import { CategoryOptions } from './category-options'
import { tagList, validTags } from './selection'
import { copy } from './copy'
import type { AssetUpdate, ReferenceAsset, ReferenceCategory } from './types'

type Props = {
  asset: ReferenceAsset
  categories: ReferenceCategory[]
  onSave(value: AssetUpdate): void
  onCancel(): void
  busy: boolean
}
export function DetailFields({ asset, categories, onSave, onCancel, busy }: Props) {
  return <form className="grid gap-3 text-sm" onSubmit={e => {
    e.preventDefault()
    const values = new FormData(e.currentTarget)
    const text = (key: string) => String(values.get(key) ?? '').trim()
    onSave({ categoryId: text('category'), sourceUrl: text('source') || null, note: text('note') || null, tags: tagList(text('tags')) })
  }}>
    <label>{copy.category}<select required name="category" className="block w-full rounded border p-2" defaultValue={asset.categoryId}>
      <CategoryOptions categories={categories} /></select></label>
    <label>{copy.source}<Input name="source" type="url" pattern="[Hh][Tt][Tt][Pp][Ss]?://.+" maxLength={2048} defaultValue={asset.sourceUrl ?? ''}
      onInput={e => { const field = e.currentTarget; field.setCustomValidity(field.validity.patternMismatch || field.validity.typeMismatch ? copy.sourceHint : '') }} />
      <span className="text-xs text-muted-foreground">{copy.sourceHint}</span></label>
    <label>{copy.note}<Textarea name="note" maxLength={2000} defaultValue={asset.note ?? ''} autoFocus /></label>
    <label>{copy.tagsHint}<Input name="tags" defaultValue={asset.tags.join(', ')} onChange={e => e.target.setCustomValidity(validTags(tagList(e.target.value)) ? '' : copy.invalidTags)} /></label>
    <div className="flex gap-2"><Button disabled={busy}>{copy.save}</Button>
      <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>{copy.cancel}</Button></div>
  </form>
}
