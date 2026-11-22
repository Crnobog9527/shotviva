import { isPresizableCoverKey, isPresizablePublicPicture, presizedPath, type PresizedFormat } from './paths'

// Where a page loads a pre-sized copy from. `origin` is the switch (NEXT_PUBLIC_PRESIZED_IMAGES_URL,
// core/public-env-schema.ts): the host that serves this site's /assets/presized/… and /presized/…
// paths, img-eo in production. Unset: no picture is pre-sized and everything renders as before.
export type PresizedEnv = { origin: string | undefined; assetsBase: string | undefined }

const ASSETS_PATH = '/assets'

// The cover's key in the public bucket, or null when the URL is not on the assets base.
function coverKeyOf(src: string, base: string | undefined): string | null {
  if (!base || !src.startsWith(`${base}/`)) return null
  const key = src.slice(base.length + 1)
  return isPresizableCoverKey(key) ? key : null
}

// A base whose path is /assets is this site's rewrite to the bucket (core/storage/assets-env.ts),
// so the copies are reached through the switch's host like any other site path. Any other base
// (r2.dev on the test site) serves the bucket itself: the copies sit next to the cover.
function coverHost(base: string, origin: string): string {
  try {
    return new URL(base).pathname.replace(/\/+$/, '') === ASSETS_PATH ? `${origin}${ASSETS_PATH}` : base
  } catch {
    return base
  }
}

// A function from a requested width (and format, WebP by default) to the copy's URL, or null when this picture has no copies
// (switch off, a motion file, a user's photo, another host, a picture outside the pre-sized dirs).
export type PresizedUrl = (width: number, format?: PresizedFormat) => string

export function presizedSource(src: unknown, env: PresizedEnv): PresizedUrl | null {
  const { origin, assetsBase } = env
  if (!origin || typeof src !== 'string') return null
  const key = coverKeyOf(src, assetsBase)
  if (key && assetsBase) {
    const host = coverHost(assetsBase, origin)
    return (width, format) => `${host}/${presizedPath(key, width, format)}`
  }
  if (isPresizablePublicPicture(src)) return (width, format) => `${origin}/${presizedPath(src.slice(1), width, format)}`
  return null
}
