// iOS web-app startup images (T65): when an iPhone opens the site from the home screen as a web
// app it shows this instead of a black screen until the page paints. One PNG per portrait screen
// (design/logo/startup.py draws them: the darkroom ground and the app icon's "S." centred); iOS
// picks the one whose media query matches the device exactly, so each entry is a real iPhone
// screen in CSS px and its pixel ratio. Landscape and iPad fall back to the plain background.
export const STARTUP_SCREENS = [
  { width: 440, height: 956, ratio: 3 },
  { width: 430, height: 932, ratio: 3 },
  { width: 420, height: 912, ratio: 3 },
  { width: 402, height: 874, ratio: 3 },
  { width: 393, height: 852, ratio: 3 },
  { width: 390, height: 844, ratio: 3 },
  { width: 428, height: 926, ratio: 3 },
  { width: 414, height: 896, ratio: 3 },
  { width: 414, height: 896, ratio: 2 },
  { width: 375, height: 812, ratio: 3 },
  { width: 375, height: 667, ratio: 2 },
] as const

export type StartupImage = { url: string; media: string }

export function startupImages(): StartupImage[] {
  return STARTUP_SCREENS.map(({ width, height, ratio }) => ({
    url: `/startup/startup-${width * ratio}x${height * ratio}.png`,
    media: `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)`,
  }))
}
