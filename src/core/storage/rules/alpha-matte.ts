// The ground a see-through upload is laid on before it becomes the model's JPEG input. Client-safe:
// the browser's compression and the server's normalisation share it.
//
// Why: a JPEG has no alpha, and both the canvas encoder and sharp turn transparent pixels black, so
// a transparent venue logo reached the image model as a solid black square (2026-11-14, reward
// posters). White is the neutral ground a logo is usually drawn for; content that is itself light
// (a white logo meant for dark backgrounds) would vanish on white, so it gets a dark ground instead.

export type Matte = { r: number; g: number; b: number }

export const MATTE_WHITE: Matte = { r: 255, g: 255, b: 255 }
export const MATTE_DARK: Matte = { r: 34, g: 34, b: 34 }

// Below this, a pixel is "see-through": anything under full opacity is enough for the encoders to
// darken it, but a stray 254 from an editor's export is not worth changing an upload for.
const SEE_THROUGH = 250
// Mean luma (0–255) of the visible content above which white would wash it out.
const LIGHT_CONTENT = 200

const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b

// RGBA bytes (canvas ImageData or sharp raw with alpha) → the ground to flatten onto, or null when
// nothing is see-through (the upload is left exactly as before). `step` samples every n-th pixel.
export function matteFor(rgba: ArrayLike<number>, step = 1): Matte | null {
  let seeThrough = false
  let weight = 0
  let sum = 0
  for (let index = 0; index + 3 < rgba.length; index += 4 * step) {
    const alpha = rgba[index + 3]!
    if (alpha < SEE_THROUGH) seeThrough = true
    weight += alpha
    sum += alpha * luma(rgba[index]!, rgba[index + 1]!, rgba[index + 2]!)
  }
  if (!seeThrough) return null
  // Fully transparent: nothing to keep visible, white is as good as anything.
  return weight > 0 && sum / weight > LIGHT_CONTENT ? MATTE_DARK : MATTE_WHITE
}

export const matteCss = ({ r, g, b }: Matte) => `rgb(${r}, ${g}, ${b})`
