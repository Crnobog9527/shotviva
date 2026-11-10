import { Button } from '@/core/ui/button'
import { seriesCopy as copy } from './copy'

export function SaveFeedback({ error, reload }: { error: string; reload: () => void }) {
  if (!error) return null
  return <>
    <p role="alert" className="text-destructive text-sm">{error}</p>
    {error === copy.changed && <Button variant="outline" onClick={reload}>{copy.reload}</Button>}
  </>
}
