// GPT-Image-2.5 takes custom WIDTHxHEIGHT sizes: both edges multiples of 16, long:short at
// most 3:1, at least 655,360 pixels. A 1536 long edge keeps latency and file size modest;
// larger outputs add nothing for a phone screen or a menu photo.
const LONG_EDGE = 1536
const SQUARE = 1024
const STEP = 16

export function outputSizeFor(aspectRatio: string): string {
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(aspectRatio)
  const w = Number(match?.[1])
  const h = Number(match?.[2])
  if (!match || w <= 0 || h <= 0) throw new Error(`invalid aspect ratio ${aspectRatio}`)
  if (w === h) return `${SQUARE}x${SQUARE}`
  if (Math.max(w, h) / Math.min(w, h) > 3) throw new Error(`aspect ratio ${aspectRatio} exceeds 3:1`)
  const short = Math.round((LONG_EDGE * Math.min(w, h)) / Math.max(w, h) / STEP) * STEP
  return w > h ? `${LONG_EDGE}x${short}` : `${short}x${LONG_EDGE}`
}
