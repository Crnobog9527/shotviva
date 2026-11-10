import type { TestPhotoView } from '../test-runs'

type ImageSource = { id: string; kind: 'photo' | 'run'; src: string; originalUrl?: string | null }
type Repair = { readyUrl?: string; finished: Promise<string | null> }

// Share a repair and its decoded image between the list prefetch, editor and gallery.
// Bound the signed URLs retained by a document that pages through a large library.
const repairs = new Map<string, Repair>()
const endpoint = ({ kind, id }: ImageSource) => `/api/admin/test-thumbnail?kind=${kind}&id=${encodeURIComponent(id)}`

export function displaySource(source: ImageSource) {
  const repair = repairs.get(source.src)
  return repair?.readyUrl ?? (repair && source.originalUrl) ?? source.src
}

async function fetchThumbnail(source: ImageSource) {
  const response = await fetch(endpoint(source), { method: 'POST', keepalive: true, priority: 'low' })
  if (!response.ok) throw new Error('Thumbnail unavailable')
  const { url } = await response.json() as { url: string }
  const image = new Image()
  image.fetchPriority = 'low'
  image.src = url
  await image.decode()
  return url
}

function repairThumbnail(source: ImageSource) {
  if (repairs.has(source.src)) return
  if (repairs.size >= 256) repairs.delete(repairs.keys().next().value!)
  const repair: Repair = {
    finished: fetchThumbnail(source).then(url => {
      repair.readyUrl = url
      return url
    }).catch(() => {
      if (repairs.get(source.src) === repair) repairs.delete(source.src)
      return null
    }),
  }
  repairs.set(source.src, repair)
}

export function onThumbnailError(image: HTMLImageElement, source: ImageSource) {
  const current = image.getAttribute('src')
  const lookup = endpoint(source)
  if (current === lookup) return
  if (current === source.src && source.originalUrl && current !== source.originalUrl) {
    image.src = source.originalUrl
    repairThumbnail(source)
  } else {
    // An old open editor can outlive both signed URLs. Mint a fresh one with the admin session.
    image.src = lookup
  }
}

export function onThumbnailLoad(image: HTMLImageElement, source: ImageSource) {
  if (image.getAttribute('src') !== source.originalUrl) return
  // Keep the original visible until both it and its replacement have decoded.
  void repairs.get(source.src)?.finished.then(url => {
    if (url && image.getAttribute('src') === source.originalUrl) image.src = url
  })
}

export function preloadPhoto(photo: TestPhotoView) {
  const source: ImageSource = { id: photo.id, kind: 'photo', src: photo.url, originalUrl: photo.originalUrl }
  const image = new Image()
  image.fetchPriority = 'low'
  image.onerror = () => onThumbnailError(image, source)
  image.onload = () => onThumbnailLoad(image, source)
  image.src = displaySource(source)
}
