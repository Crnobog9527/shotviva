// A style reference's image through the admin gate (/api/admin/style-refs), which signs the private
// file for the template it belongs to. Keys look like style-refs/<templateId>/<imageId>.webp.
export function styleRefUrl(key: string): string | null {
  const [, templateId, filename] = key.split('/')
  if (!templateId || !filename) return null
  return `/api/admin/style-refs?${new URLSearchParams({ templateId, imageId: filename.replace(/\.[a-z]+$/, '') })}`
}
