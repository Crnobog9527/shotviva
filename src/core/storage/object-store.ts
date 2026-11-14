// The slice of object storage the app uses. R2 implements it in r2-store.ts; tests pass
// an in-memory fake (tests/fakes/memory-store.ts), so no test touches the network.

export type ObjectHead = { size: number; contentType: string | null }

export type PresignGetOptions = { expiresInSeconds: number; downloadName?: string }

export type ObjectStore = {
  presignPut(key: string, contentType: string, expiresInSeconds: number): Promise<string>
  presignGet(key: string, options: PresignGetOptions): Promise<string>
  // null when the object does not exist.
  head(key: string): Promise<ObjectHead | null>
  // Bound reads of a browser-writable staging key even when a PUT races its HEAD.
  get(key: string, maxBytes?: number): Promise<Uint8Array>
  // Cover assets are immutable; protected reference media explicitly opt out of caching.
  put(key: string, body: Uint8Array, contentType: string, options?: { cacheControl?: string }): Promise<void>
  // Server-side copy inside the bucket: the bytes never pass through our function (§8.3, T40).
  copy(sourceKey: string, destinationKey: string): Promise<void>
  delete(key: string): Promise<void>
  deletePrefix(prefix: string): Promise<void>
}
