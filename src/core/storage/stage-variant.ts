import 'server-only'

import type { ObjectStore } from './object-store'

// A derived download (a cut-out's 白底 JPEG, a free cut-out's marked PNG) is made once, written to
// the private bucket and handed out as a short signed GET, like the batch ZIP: no image bytes
// pass the function's response (AGENTS §6), and a second download reuses the copy until the
// inputs/ lifecycle removes it. Two racing first downloads both write the same bytes; harmless.
export async function stageVariant(
  store: ObjectStore,
  req: { sourceKey: string; key: string; contentType: string; make(source: Uint8Array): Promise<Uint8Array> },
): Promise<void> {
  if (await store.head(req.key)) return
  const bytes = await req.make(await store.get(req.sourceKey))
  await store.put(req.key, bytes, req.contentType)
}
