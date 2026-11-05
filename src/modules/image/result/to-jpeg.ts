// Share hands the OS one JPEG (MOBILE_UI_rules §1.8.1 rule 4): paid outputs are PNG, which
// some apps drop silently when large, so they are re-encoded here. Falls back to the original.
export async function toJpeg(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/jpeg') return blob
  try {
    const bitmap = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0)
    bitmap.close()
    const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
    return jpeg ?? blob
  } catch {
    return blob
  }
}
