// The { code } of an /api/wishlist error response, or null when the body is not one.
export async function errorCode(response: Response): Promise<string | null> {
  const body: unknown = await response.json().catch(() => null)
  if (body && typeof body === 'object' && 'code' in body && typeof body.code === 'string') return body.code
  return null
}
