# MiSans web fonts

Official, unmodified static WOFF2 subsets for weights 400, 500 and 600 (Simplified Chinese + Latin). `manifest.json` records each original Xiaomi URL, unicode range, byte length and SHA-256; filenames use the complete content hash. `LICENSE.pdf` is the original Xiaomi agreement; `NOTICE.txt` retains attribution. Font metadata is preserved.

Shotviva uses MiSans for Chinese headings only, at the regular weight (400) they have always rendered at (T67, ARCHITECTURE §17); body and UI text use the system CJK fonts. `misans-400-<hash>.css` holds the 56 weight-400 `@font-face` rules of `misans-4bf5d8a22f58eaab.css` verbatim (the full aggregate stays for reference). `core/ui/misans-stylesheet.tsx` links it in the server-rendered `<head>` of Chinese pages, so cached subsets are used on the first paint; on a first visit a metric-matched system fallback shows until `font-display: swap` replaces it. Browser `unicode-range` selection loads only required subsets, including new chat text. No external font host is contacted at runtime. CSS and WOFF2 receive a one-year immutable cache header; update their hash-based URLs when changing content. Do not reuse a hashed URL for different bytes.

Only this public resource directory bypasses the application proxy. It must never contain private material or application endpoints. Attribution and the agreement link appear in the public marketing footer, never the authenticated workspace.

Coverage is not the full MiSans collection: unsupported traditional/rare characters fall back to local system fonts. Code/preformatted content retains the existing monospace stack. Existing font sizes, line heights, layout and application behavior are unchanged. No full-font preload or new font dependency is added.

Sources: https://hyperos.mi.com/font/download and https://font.sec.miui.com/font/css?family=MiSans:400,500,600:Chinese_Simplify,Latin&display=swap . Files verified against the independent 2026-09-25 font experiment. Do not regenerate/subset the font binaries.
