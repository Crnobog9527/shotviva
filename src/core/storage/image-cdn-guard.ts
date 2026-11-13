// The image CDN (Tencent EdgeOne, img-eo.shotviva.com) forwards to shotviva.com and must only
// ever serve /_next/image (core/ui/cover-image.ts). EdgeOne blocks every other path itself; as a
// second lock it adds this header to each request it forwards, and the proxy answers any page or
// API request carrying it with a 404. Otherwise img-eo could become a mirror of the whole site,
// and sign-ups through it would arrive from EdgeOne's node IPs, defeating the per-IP limits.
// Not a secret: a visitor who sends it themselves only gets 404s.
export const IMAGE_CDN_HEADER = 'x-shotviva-image-cdn'

export function viaImageCdn(headers: Headers): boolean {
  return headers.has(IMAGE_CDN_HEADER)
}
