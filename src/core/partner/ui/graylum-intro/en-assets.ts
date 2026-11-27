// The English animations that are in public/partners/graylum, by file name (delivered as
// `<name>-en.webm`, `-en.mp4` and `-en-poster.webp`). A name added here must have its file in the
// same PR (en-assets.test.ts fails when the two disagree). A file that is not listed falls back to
// the Chinese one, decided at build time, so no request ever 404s.
export const EN_ASSETS: ReadonlySet<string> = new Set<string>([
  'graylum-hero-6steps-en.webm',
  'graylum-hero-6steps-en.mp4',
  'graylum-hero-6steps-en-poster.webp',
  'graylum-scene-1-voiceover-en.webm',
  'graylum-scene-1-voiceover-en.mp4',
  'graylum-scene-1-voiceover-en-poster.webp',
  'graylum-scene-2-post-en.webm',
  'graylum-scene-2-post-en.mp4',
  'graylum-scene-2-post-en-poster.webp',
  'graylum-scene-3-storyboard-en.webm',
  'graylum-scene-3-storyboard-en.mp4',
  'graylum-scene-3-storyboard-en-poster.webp',
  'graylum-scene-4-repurpose-en.webm',
  'graylum-scene-4-repurpose-en.mp4',
  'graylum-scene-4-repurpose-en-poster.webp',
  'graylum-scene-5-image-with-shotviva-en.webm',
  'graylum-scene-5-image-with-shotviva-en.mp4',
  'graylum-scene-5-image-with-shotviva-en-poster.webp',
  'graylum-scene-6-more-tools-en.webm',
  'graylum-scene-6-more-tools-en.mp4',
  'graylum-scene-6-more-tools-en-poster.webp',
])
