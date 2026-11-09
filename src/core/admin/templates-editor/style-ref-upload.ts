import type { AfterCover } from '../covers/after-cover-source'
import { coverFileProblem } from '../covers/cover-rules'
import { compressImage } from '@/core/storage/upload'
import { STYLE_REF_EDGE, type StyleRef } from '@/core/templates/style-refs'
import { styleRefCopy } from './copy'

type Ticket = { uploadId: string; putUrl: string; headers: Record<string, string> }
const api = '/api/admin/style-refs'

async function request<T>(method: 'POST' | 'PATCH' | 'PUT', payload: unknown): Promise<T> {
  const response = await fetch(api, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  const body = await response.json()
  if (!response.ok) throw new Error(body.message ?? styleRefCopy.invalidUpload)
  return body as T
}

export async function uploadStyleRef(templateId: string, file: File) {
  const problem = coverFileProblem('before', file)
  if (problem) throw new Error(problem)
  // Resize and strip metadata before leaving the browser. Lossless staging avoids two lossy encodes.
  const image = await compressImage(file, { longEdge: STYLE_REF_EDGE, type: 'image/png' }).catch(() => null)
  if (!image) throw new Error(styleRefCopy.decodeFailed)
  const { uploadId, putUrl, headers } = await request<Ticket>('POST', { templateId, contentType: image.type, size: image.size })
  const result = await fetch(putUrl, { method: 'PUT', headers, body: image })
  if (!result.ok) throw new Error(styleRefCopy.invalidUpload)
  return request<StyleRef>('PATCH', { templateId, uploadId })
}

export function reuseAfterCover(templateId: string, { locale, hash }: AfterCover) {
  return request<StyleRef>('PUT', { templateId, locale, hash })
}
