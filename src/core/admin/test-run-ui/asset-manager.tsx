'use client'

import { Button } from '@/core/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/core/ui/dialog'
import { useAssetManager, type AssetManagerOptions } from './use-asset-manager'
import { TEST_RUN_COPY as COPY } from './copy'
import { TestThumbnail } from './test-thumbnail'

export function AssetManager(options: AssetManagerOptions) {
  const { kind } = options
  const { open, ids, busy, items, next, load, remove, show, changeOpen, toggle } = useAssetManager(options)
  return <>
    <Button type="button" variant="outline" size="sm" className="justify-self-start"
      onClick={show}>{COPY.removal[kind]}</Button>
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>{COPY.removal[kind]}</DialogTitle></DialogHeader>
        <fieldset disabled={busy} className="max-h-[55vh] overflow-auto">
          <legend className="text-sm">{COPY.removal.select}</legend>
          {items.map(item => <label key={item.id} className="flex items-center gap-3 border-b py-2 text-sm">
            <input type="checkbox" disabled={!ids.includes(item.id) && ids.length >= 50} checked={ids.includes(item.id)} onChange={() => toggle(item.id)} />
            {item.thumbnail && <TestThumbnail id={item.id} kind={kind} src={item.thumbnail} alt="" className="size-12 rounded object-cover" lazy />}
            <span>{item.label} {new Date(item.date).toLocaleString('zh-CN')} · {item.id.slice(0, 8)}</span>
          </label>)}
          {next && <Button size="sm" variant="ghost" onClick={() => void load(next)}>{COPY.removal.more}</Button>}
          {!busy && !items.length && <p className="text-muted-foreground text-sm">{COPY.removal.empty}</p>}
        </fieldset>
        <Button variant="destructive" disabled={busy || !ids.length} onClick={() => void remove()}>{COPY.removal.submit(ids.length)}</Button>
      </DialogContent>
    </Dialog>
  </>
}
