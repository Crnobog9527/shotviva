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
      <DialogContent className="left-[50dvw] grid max-h-[calc(100dvh-2rem)] w-[calc(100dvw-2rem)] max-w-lg min-w-0 grid-cols-1 grid-rows-[auto_minmax(0,1fr)_auto] p-4 sm:p-6">
        <DialogHeader className="px-6 sm:px-0"><DialogTitle>{COPY.removal[kind]}</DialogTitle></DialogHeader>
        <fieldset disabled={busy} className="max-h-[55dvh] min-h-0 min-w-0 overflow-y-auto">
          <legend className="text-sm">{COPY.removal.select}</legend>
          {items.map(item => <label key={item.id} className="flex min-w-0 items-center gap-3 border-b py-2 text-sm">
            <input type="checkbox" className="shrink-0" disabled={!ids.includes(item.id) && ids.length >= 50} checked={ids.includes(item.id)} onChange={() => toggle(item.id)} />
            {item.thumbnail && <TestThumbnail id={item.id} kind={kind} src={item.thumbnail} originalUrl={item.originalUrl} alt="" className="size-12 rounded object-cover" lazy />}
            <span className="min-w-0 [overflow-wrap:anywhere]">{item.label} {new Date(item.date).toLocaleString('zh-CN')} · {item.id.slice(0, 8)}</span>
          </label>)}
          {next && <Button size="sm" variant="ghost" onClick={() => void load(next)}>{COPY.removal.more}</Button>}
          {!busy && !items.length && <p className="text-muted-foreground text-sm">{COPY.removal.empty}</p>}
        </fieldset>
        <Button type="button" variant="destructive" size="touch" disabled={busy || !ids.length} onClick={() => void remove()}>{COPY.removal.submit(kind, ids.length)}</Button>
      </DialogContent>
    </Dialog>
  </>
}
