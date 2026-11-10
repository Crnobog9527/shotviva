import { copy } from './copy'
import { previewUrl } from './api'
import type { Display } from './filters'
import type { ReferenceAsset } from './types'

const layouts = {
  compact: 'grid-cols-[repeat(auto-fill,minmax(8rem,1fr))]',
  large: 'grid-cols-[repeat(auto-fill,minmax(12rem,1fr))]',
  list: 'grid-cols-1',
}
type Props = {
  items: ReferenceAsset[]
  selected: Set<string>
  display: Display
  onToggle(id: string, range: boolean): void
  onOpen(asset: ReferenceAsset): void
}
export function AssetGrid({ items, selected, display, onOpen, onToggle }: Props) {
  const list = display === 'list'
  return <ul className={`grid gap-2 ${layouts[display]}`}>
    {items.map(asset => <li key={asset.id} className={`relative overflow-hidden rounded border ${selected.has(asset.id) ? 'border-primary ring-1 ring-primary' : ''}`}>
      <button type="button" aria-label={`${copy.open} · ${asset.note || asset.id}`} className={`w-full text-left ${list ? 'flex items-center gap-3' : 'block'}`}
        onClick={e => e.shiftKey ? onToggle(asset.id, true) : onOpen(asset)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- An authenticated same-origin request is required. */}
        <img loading="lazy" src={previewUrl(asset.id)} width={asset.width} height={asset.height} alt=""
          className={`bg-muted object-cover ${list ? 'h-20 w-28' : 'aspect-square w-full'}`} />
        <span className="grid min-w-0 gap-0.5 p-2 text-xs">
          {asset.note && <span className="truncate text-sm">{asset.note}</span>}
          {!!asset.tags.length && <span className="truncate">{asset.tags.join(' · ')}</span>}
          <span className="text-muted-foreground">{copy.used(asset.usedInTemplates)}</span>
          {list && <span>{new Date(asset.createdAt).toLocaleDateString('zh-CN')}</span>}
        </span>
      </button>
      <input type="checkbox" aria-label={copy.selectNamed(asset.note || asset.id)} checked={selected.has(asset.id)}
        className="absolute top-1.5 left-1.5 size-5 accent-primary"
        onClick={e => onToggle(asset.id, e.shiftKey)} onChange={() => {}} />
    </li>)}
  </ul>
}
