import { Input } from '@/core/ui/input'
import { Textarea } from '@/core/ui/textarea'

import { seriesCopy as copy } from './copy'
import type { SeriesFields as Fields } from './types'

export type SeriesCategoryChoice = { key: string; label: string }
type Props = { fields: Fields; patch: (changes: Partial<Fields>) => void; choices: SeriesCategoryChoice[] }

export function SeriesFields({ fields, patch, choices }: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {(['name_zh', 'name_en', 'slug'] as const).map(key => (
        <label className="grid gap-1.5 text-sm" key={key}>
          {copy[key]}
          <Input value={fields[key]} required maxLength={key === 'slug' ? 128 : 200}
            onChange={e => patch({ [key]: e.target.value })} />
          {key === 'slug' && <span className="text-muted-foreground text-xs">{copy.slugHint}</span>}
        </label>
      ))}
      <label className="grid content-start gap-1.5 text-sm">
        {copy.category}
        <select className="border-input h-9 rounded-md border bg-transparent px-3 text-sm" value={fields.category_key}
          required onChange={e => patch({ category_key: e.target.value })}>
          <option value="" disabled>{copy.noCategory}</option>
          {choices.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </label>
      {(['description_zh', 'description_en'] as const).map(key => (
        <label className="grid gap-1.5 text-sm" key={key}>
          {copy[key]}
          <Textarea value={fields[key] ?? ''} maxLength={5000} onChange={e => patch({ [key]: e.target.value })} />
        </label>
      ))}
      <label className="grid content-start gap-1.5 text-sm">
        {copy.sort_order}
        <Input type="number" value={Number.isFinite(fields.sort_order) ? fields.sort_order : ''} step={1}
          onChange={e => patch({ sort_order: e.currentTarget.valueAsNumber })} />
        <span className="text-muted-foreground text-xs">{copy.sortHint}</span>
      </label>
      <div className="grid content-start gap-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={fields.is_active} onChange={e => patch({ is_active: e.target.checked })} />{copy.active}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={fields.show_members} onChange={e => patch({ show_members: e.target.checked })} />{copy.showMembers}
        </label>
        <p className="text-muted-foreground text-xs">{copy.publicationHint}</p>
      </div>
    </div>
  )
}
