import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'
import { copy } from './copy'
import type { AssetFilter } from './types'

export type Display = 'compact' | 'large' | 'list'
type Props = {
  filter: AssetFilter
  onChange(filter: Partial<AssetFilter>): void
  display: Display
  onDisplay(value: Display): void
}

export function Filters({ filter, onChange, display, onDisplay }: Props) {
  return <div className="grid gap-3">
    <div className="flex flex-wrap items-center gap-2">
      {(['active', 'archived'] as const).map(status => <Button key={status} size="sm" aria-pressed={status === filter.status}
        variant={status === filter.status ? 'secondary' : 'outline'} onClick={() => onChange({ status })}>{copy[status]}</Button>)}
      <select className="ml-auto rounded border p-1 text-sm" aria-label={copy.sort} value={filter.sort}
        onChange={e => onChange({ sort: e.target.value as AssetFilter['sort'] })}>
        <option value="newest">{copy.newest}</option><option value="oldest">{copy.oldest}</option>
      </select>
      <select aria-label={copy.display} className="rounded border p-1 text-sm" value={display} onChange={e => onDisplay(e.target.value as Display)}>
        {(['compact', 'large', 'list'] as const).map(value => <option key={value} value={value}>{copy[value]}</option>)}
      </select>
    </div>
    <form className="flex flex-wrap gap-2" onSubmit={e => {
      e.preventDefault()
      const fields = new FormData(e.currentTarget)
      onChange({ tag: String(fields.get('tag')).trim(), note: String(fields.get('note')).trim() })
    }}>
      <Input type="search" name="tag" className="min-w-24 flex-1" aria-label={copy.searchTag} placeholder={copy.searchTag} defaultValue={filter.tag} maxLength={64} />
      <Input type="search" name="note" className="min-w-32 flex-1" aria-label={copy.searchNote} placeholder={copy.searchNote} defaultValue={filter.note} maxLength={2000} />
      <Button type="submit" variant="outline">{copy.search}</Button>
    </form>
  </div>
}
