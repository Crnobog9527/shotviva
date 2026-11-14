import { useState } from 'react'
import type { TestPhotoView } from '../test-runs'
import { TestThumbnail } from '../test-run-ui/test-thumbnail'
import { uploadTestPhoto } from '../test-run-ui/api'
import { UPLOAD_ACCEPT } from '@/core/storage/rules'
import { labError } from './api'
import { copy as c } from './copy'

type Props = { photos: TestPhotoView[]; selected: string[]; onSelect(ids: string[]): void }
export function Photos({ photos, selected, onSelect }: Props) {
  const [uploads, setUploads] = useState<TestPhotoView[]>([])
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState('')
  const seen = new Set(uploads.map(photo => photo.id))
  const items = [...uploads, ...photos.filter(photo => !seen.has(photo.id))]
  async function upload(files: File[]) {
    setError(''); const added: string[] = []
    try {
      for (const file of files) {
        setProgress(file.name)
        const photo = await uploadTestPhoto(file, fraction => setProgress(`${file.name} ${Math.round(fraction * 100)}%`))
        setUploads(prev => [photo, ...prev]); added.push(photo.id)
      }
    } catch (e) { setError(labError(e)) }
    finally { onSelect([...selected, ...added].slice(0, 12)); setProgress(null) }
  }
  return <fieldset disabled={!!progress} className="grid gap-2"><legend>{c.photos}</legend>
    <label className="text-sm">{c.upload}<input type="file" multiple accept={UPLOAD_ACCEPT} className="block"
      onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ''; if (files.length) void upload(files) }} /></label>
    {!items.length && <p>{c.noPhotos}</p>}
    <div className="flex flex-wrap gap-2">{items.map((p, i) => <label key={p.id} className="relative cursor-pointer">
      <TestThumbnail kind="photo" id={p.id} src={p.url} originalUrl={p.originalUrl} thumbnailMissing={p.thumbnailMissing} alt={c.onePhoto + ' ' + (i + 1)} className="size-16 rounded object-cover" />
      <input type="checkbox" checked={selected.includes(p.id)} aria-label={c.onePhoto + ' ' + (i + 1)} className="absolute top-1 left-1"
        onChange={e => onSelect(e.target.checked ? [...selected, p.id] : selected.filter(id => id !== p.id))} />
    </label>)}</div>{progress && <p role="status">{progress}</p>}{error && <p role="alert">{error}</p>}</fieldset>
}
