// The two files a cut-out (a transparent-background result) can be saved as, shared by the
// download route and the result page's choice. Client-safe: no server-only imports.
//   white:       flattened onto pure #FFFFFF, as a JPEG (how the app shows the cut-out)
//   transparent: the alpha channel kept, as a PNG (the stored original for paid works)
export const DOWNLOAD_BACKGROUNDS = ['white', 'transparent'] as const
export type DownloadBackground = (typeof DOWNLOAD_BACKGROUNDS)[number]

// White is what the result page shows, so it is what a first download should give.
export const DEFAULT_DOWNLOAD_BACKGROUND: DownloadBackground = 'white'

export function isDownloadBackground(value: unknown): value is DownloadBackground {
  return (DOWNLOAD_BACKGROUNDS as readonly unknown[]).includes(value)
}
