// The English animations that are in public/partners/graylum, by file name. The Graylum team
// delivers them as `<name>-en.webm`, `-en.mp4` and `-en-poster.webp`; add a name here in the
// same PR that adds the file (en-assets.test.ts fails when the two disagree). A file that is not
// listed falls back to the Chinese one, decided at build time, so no request ever 404s.
export const EN_ASSETS: ReadonlySet<string> = new Set<string>([])
