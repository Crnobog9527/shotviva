// What a 'use cache: remote' read returns instead of throwing. An error thrown inside a cache
// function fails the prerender of every page that reads it, even when the caller catches it (a build
// without a database), and loses its class on the way out. So the shared read settles: a failure
// is a plain value, cached for FAILED_READ_LIFE only, and unwrap() turns it back into an error for
// the caller's own fallback (each caller keeps its own short lifetime and log line).

export type Settled<T> = { ok: true; value: T } | { ok: false; message: string }

export async function settle<T>(read: () => Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await read() }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

export function unwrap<T>(settled: Settled<T>): T {
  if (settled.ok) return settled.value
  throw new Error(settled.message)
}
