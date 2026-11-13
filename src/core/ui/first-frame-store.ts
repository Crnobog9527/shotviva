// First frames (small data: URI copies of a picture, about 10 KB of base64 that does not
// compress) used to be handed to the page as a prop, so each one travelled twice in the HTML:
// once in the <img> and once in the hydration data. They are kept here instead, on the server
// only: the code that knows a frame registers it under the picture's address, and the <img> that
// draws it (first-frame.tsx) looks it up while the server writes the markup. The browser never
// needs the bytes again: the full picture covers the frame as soon as it has loaded.
//
// One store per server process, shared by the React server and HTML renderers through
// globalThis (they load separate copies of this module).
const MAX_FRAMES = 200

type Store = Map<string, string>
const holder = globalThis as { __svFirstFrames?: Store }

export function registerFirstFrame(key: string, dataUri: string | null | undefined): boolean {
  if (!dataUri || typeof window !== 'undefined') return false
  const store = (holder.__svFirstFrames ??= new Map())
  // Re-inserting moves the key to the end, so the oldest entry is the least recently registered.
  store.delete(key)
  store.set(key, dataUri)
  if (store.size > MAX_FRAMES) store.delete(store.keys().next().value as string)
  return true
}

export function firstFrameOf(key: string): string | undefined {
  return typeof window === 'undefined' ? holder.__svFirstFrames?.get(key) : undefined
}
