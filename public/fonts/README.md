# Self-hosted fonts

Geist and Geist Mono live in `public/fonts/geist/` under content-hashed names; `src/core/ui/geist-fonts.tsx` declares them on the static-file CDN's host when `NEXT_PUBLIC_ASSET_CDN_URL` is set (no longer `next/font`, whose inlined @font-face and preload ended up on different hosts). Instrument Serif lives in `public/fonts/instrument-serif/` under content-hashed names and is declared in `src/app/globals-body.css`, so that only English headings fetch it (`src/core/ui/instrument-serif.tsx`). No font is preloaded: Chrome holds the first paint for a preloaded font, and every face has a metric-matched fallback. They were copied from `design/comps-v3-b/fonts/` and are served from our own origin, never from a font CDN. Every file is under the **SIL Open Font License 1.1**. The license text ships next to the fonts, as the OFL requires for redistribution.

The version and copyright for each file below are read from that file's own `name` table.

| File | Family / style | Version | Upstream | License |
|---|---|---|---|---|
| `public/fonts/geist/geist-<hash>.woff2` | Geist, variable weight (we use 400–700) | 1.800 | [vercel/geist-font](https://github.com/vercel/geist-font) | OFL 1.1, see [`OFL.txt`](geist/OFL.txt) |
| `public/fonts/geist/geist-mono-<hash>.woff2` | Geist Mono, variable weight (we use 400–500) | 1.701 | [vercel/geist-font](https://github.com/vercel/geist-font) | OFL 1.1, see [`OFL.txt`](geist/OFL.txt) |
| `public/fonts/instrument-serif/instrument-serif-<hash>.woff2` | Instrument Serif Regular | 1.000 | [Instrument/instrument-serif](https://github.com/Instrument/instrument-serif) | OFL 1.1, see [`OFL.txt`](instrument-serif/OFL.txt) next to the files |
| `public/fonts/instrument-serif/instrument-serif-italic-<hash>.woff2` | Instrument Serif Italic | 1.000 | [Instrument/instrument-serif](https://github.com/Instrument/instrument-serif) | OFL 1.1, see [`OFL.txt`](instrument-serif/OFL.txt) next to the files |

## License files

- **`geist/OFL.txt`** starts with the copyright line embedded in the Geist and Geist Mono files above: "Copyright 2024 The Geist Project Authors". The file is verbatim from Google Fonts (`google/fonts`, `ofl/geist/OFL.txt`; `ofl/geistmono/OFL.txt` is identical). Its license body matches `OFL.txt` in vercel/geist-font. That repo's current `OFL.txt` says "Copyright 2026" because it covers newer releases. If the font files are ever updated, take the license text from the same release.
- **`instrument-serif/OFL.txt`** is verbatim from Instrument/instrument-serif (`OFL.txt`). It is byte-identical to Google Fonts' `ofl/instrumentserif/OFL.txt`.

The files are subset WOFF2 builds of the upstream fonts. Their family names are unchanged, and none of them uses a Reserved Font Name, so the OFL allows that.

MiSans (Simplified Chinese, DESIGN §3.2) is in `misans/` with its own notices. Its attribution goes in the Terms page's "Third-party notices" section (ARCHITECTURE §17).
