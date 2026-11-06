# Self-hosted fonts

These are loaded by `src/app/fonts.ts` through `next/font/local` (DESIGN §3.2). They were copied from `design/comps-v3-b/fonts/` and are served from our own origin, never from a font CDN. Every file is under the **SIL Open Font License 1.1**. The license text ships next to the fonts, as the OFL requires for redistribution.

The version and copyright for each file below are read from that file's own `name` table.

| File | Family / style | Version | Upstream | License |
|---|---|---|---|---|
| `geist.woff2` | Geist, variable weight (we use 400–700) | 1.800 | [vercel/geist-font](https://github.com/vercel/geist-font) | OFL 1.1, see [`OFL-Geist.txt`](OFL-Geist.txt) |
| `geist-mono.woff2` | Geist Mono, variable weight (we use 400–500) | 1.701 | [vercel/geist-font](https://github.com/vercel/geist-font) | OFL 1.1, see [`OFL-Geist.txt`](OFL-Geist.txt) |
| `instrument-serif.woff2` | Instrument Serif Regular | 1.000 | [Instrument/instrument-serif](https://github.com/Instrument/instrument-serif) | OFL 1.1, see [`OFL-InstrumentSerif.txt`](OFL-InstrumentSerif.txt) |
| `instrument-serif-italic.woff2` | Instrument Serif Italic | 1.000 | [Instrument/instrument-serif](https://github.com/Instrument/instrument-serif) | OFL 1.1, see [`OFL-InstrumentSerif.txt`](OFL-InstrumentSerif.txt) |

## License files

- **`OFL-Geist.txt`** starts with the copyright line embedded in the Geist and Geist Mono files above: "Copyright 2024 The Geist Project Authors". The file is verbatim from Google Fonts (`google/fonts`, `ofl/geist/OFL.txt`; `ofl/geistmono/OFL.txt` is identical). Its license body matches `OFL.txt` in vercel/geist-font. That repo's current `OFL.txt` says "Copyright 2026" because it covers newer releases. If the font files are ever updated, take the license text from the same release.
- **`OFL-InstrumentSerif.txt`** is verbatim from Instrument/instrument-serif (`OFL.txt`). It is byte-identical to Google Fonts' `ofl/instrumentserif/OFL.txt`.

The files are subset WOFF2 builds of the upstream fonts. Their family names are unchanged, and none of them uses a Reserved Font Name, so the OFL allows that.

MiSans (Simplified Chinese, DESIGN §3.2) is not in this folder. Its attribution goes in the Terms page's "Third-party notices" section (ARCHITECTURE §17).
