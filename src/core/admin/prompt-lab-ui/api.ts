import { copy } from './copy'

export class LabRequestError extends Error {
  constructor(readonly code: string, message: string) { super(message) }
}

export async function labRequest<T>(path: string, body?: object): Promise<T> {
  const response = await fetch('/api/admin/prompt-lab/' + path, {
    method: body ? 'POST' : 'GET', cache: 'no-store',
    ...(body && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  })
  const result = await response.json()
  if (!response.ok) throw new LabRequestError(result.code, result.message || copy.failed)
  return result
}
export const labError = (e: unknown) => e instanceof Error ? e.message : copy.failed
