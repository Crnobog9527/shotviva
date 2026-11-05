// The viewfinder readout beside "Your photo" ("4:5 · as shot", B comp workspace.html): the
// picked photo's shape, rounded to the nearest everyday ratio.
const RATIOS: readonly [number, number][] = [
  [1, 1], [4, 5], [5, 4], [3, 4], [4, 3], [2, 3], [3, 2], [9, 16], [16, 9],
]

export function nearestRatio(width: number, height: number): string | null {
  if (width <= 0 || height <= 0) return null
  const target = Math.log(width / height)
  let best = RATIOS[0] as [number, number]
  for (const ratio of RATIOS) {
    if (Math.abs(Math.log(ratio[0] / ratio[1]) - target) < Math.abs(Math.log(best[0] / best[1]) - target)) best = ratio
  }
  return `${best[0]}:${best[1]}`
}

// Natural size of a picked photo (EXIF orientation applied by the decoder).
export async function naturalSize(url: string): Promise<{ width: number; height: number }> {
  const image = new Image()
  image.src = url
  await image.decode()
  return { width: image.naturalWidth, height: image.naturalHeight }
}
