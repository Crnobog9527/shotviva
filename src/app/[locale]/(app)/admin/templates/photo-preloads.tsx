import type { TestPhotoView } from '@/core/admin/test-runs'

export async function PhotoPreloads({ previews }: { previews: Promise<TestPhotoView[] | null> }) {
  const photos = await previews
  return photos?.map(photo => <link key={photo.id} rel="preload" as="image" href={photo.thumbnailMissing ? photo.originalUrl : photo.url} />)
}
