import { putWithProgress } from '@/core/storage/upload'
import { prepareReferenceUpload } from './prepare-upload'
import { referenceTicket, registeredReference, type RegisteredReference } from './upload-schema'

async function send(method: 'POST' | 'PATCH', payload: object): Promise<unknown> {
  const response = await fetch('/api/admin/references/uploads', {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })
  const value = await response.json().catch(() => null)
  if (!response.ok) throw new Error(value?.message || '上传失败，请重试')
  return value
}

export async function uploadReference(file: File, categoryId: string, onProgress: (fraction: number) => void): Promise<RegisteredReference> {
  onProgress(0)
  const { body, sha256 } = await prepareReferenceUpload(file)
  const payload = { sha256, size: body.size, categoryId }
  const reply = await send('POST', payload)
  const existing = registeredReference.safeParse(reply)
  if (existing.success) return existing.data
  const { uploadId, putUrl } = referenceTicket.parse(reply)
  await putWithProgress(putUrl, body, { 'Content-Type': 'image/webp' }, onProgress)
  return registeredReference.parse(await send('PATCH', { ...payload, uploadId }))
}
