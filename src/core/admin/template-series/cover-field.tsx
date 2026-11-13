import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'
import { seriesCopy as copy } from './copy'

export function CoverField({ url, change }: { url: string | null; change: (url: string | null) => void }) {
  return (
    <div className="grid gap-1.5 text-sm">
      <label className="grid gap-1">{copy.coverField}
        <Input type="url" placeholder={copy.automatic} maxLength={4096} value={url ?? ''} onChange={e => change(e.target.value || null)} />
      </label>
      <p className="text-muted-foreground text-xs">{copy.coverHint}</p>
      {url && <Button className="justify-self-start" variant="outline" size="sm" onClick={() => change(null)}>{copy.autoCover}</Button>}
    </div>
  )
}
