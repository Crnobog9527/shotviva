# Shotviva logo: the final mark "S." (Owner, 2026-11-07). Regenerates every SVG in this folder and test.html.
# The S and the period are Instrument Serif's own glyphs (instrument-S.json, extracted with fontTools from
# comps-v3-b/fonts/instrument-serif.woff2, SIL OFL 1.1). Three optical weights: the icon carries more weight than the
# mark beside the wordmark; the favicon more still. Colours are the Darkroom tokens.
import json

INK_DARK, INK_LIGHT, ORANGE, GROUND = '#F2ECE3', '#0B0A09', '#FF5B2E', '#0B0A09'
FAT_ICON, FAT_LOCK, FAT_FAV = 80, 45, 110          # font units added around the glyph outline
STYLE = (f'<style>.ink{{fill:{INK_DARK}}}.inks{{stroke:{INK_DARK}}}'
         f'@media (prefers-color-scheme: light){{.ink{{fill:{INK_LIGHT}}}.inks{{stroke:{INK_LIGHT}}}}}</style>')
_IS = json.load(open('instrument-S.json'))


def glyphs(fat, k, x0, y0, ink):
    """The S thickened by `fat`, the period set after it at the font's advance. Returns (svg, dot cx, cy, r)."""
    tf = f'translate({x0 + fat * k / 2:.3f} {y0 + fat * k / 2 + 730 * k:.3f}) scale({k:.5f} {-k:.5f}) translate(-41 0)'
    w_s = (336 + fat) * k; dot_w = (105 + fat * .6) * k
    g = (f'<g fill="{ink}" stroke="{ink}" stroke-width="{fat}" stroke-linejoin="round" stroke-linecap="round">'
         f'<path d="{_IS["S"]}" transform="{tf}"/></g>')
    return g, x0 + w_s + 1.2 + dot_w / 2, y0 + fat * k + 739 * k - dot_w / 2, dot_w / 2


def mark(ink, fat, k, box=48, x0=None, y0=None):
    w = (336 + fat) * k + 1.2 + (105 + fat * .6) * k; h = (739 + fat) * k
    x0 = (box - w) / 2 if x0 is None else x0; y0 = (box - h) / 2 if y0 is None else y0
    g, cx, cy, r = glyphs(fat, k, x0, y0, ink)
    return g + f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{r:.2f}" fill="{ORANGE}"/>'


def themed(body):  # ink follows the tab bar; the attributes stay as a fallback for renderers without CSS
    return body.replace(f'fill="{INK_DARK}" stroke="{INK_DARK}"', f'class="ink inks" fill="{INK_DARK}" stroke="{INK_DARK}"')


def svg(vb, body, w=None):
    size = f' width="{w}" height="{w}"' if w else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vb} {vb}"{size}>{STYLE}{body}</svg>'


SMALL = '<g transform="scale(.3333)">' + themed(mark(INK_DARK, FAT_FAV, 38 / 739)) + '</g>'
MONO = SMALL.replace(f'fill="{ORANGE}"', f'class="ink" fill="{INK_DARK}"')
LOCKMARK = themed(mark(INK_DARK, FAT_LOCK, 32 / 739, x0=2, y0=8))
_g, _cx, _cy, _r = glyphs(FAT_ICON, 40 / 739, (48 - ((336 + FAT_ICON) * 40 / 739 + 1.2 + (105 + FAT_ICON * .6) * 40 / 739)) / 2, (48 - (739 + FAT_ICON) * 40 / 739) / 2, INK_DARK)
ICON = (f'<defs><filter id="g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="26"/></filter>'
        f'<linearGradient id="lip" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".08"/><stop offset=".3" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>'
        f'<rect width="1024" height="1024" rx="224" fill="{GROUND}"/><rect width="1024" height="1024" rx="224" fill="url(#lip)"/>'
        f'<g transform="translate(96 96) scale(17.33)">{_g}</g>'
        f'<circle cx="{96 + _cx * 17.33:.1f}" cy="{96 + _cy * 17.33:.1f}" r="{_r * 17.33 * 1.6:.1f}" fill="{ORANGE}" opacity=".35" filter="url(#g)"/>'
        f'<circle cx="{96 + _cx * 17.33:.1f}" cy="{96 + _cy * 17.33:.1f}" r="{_r * 17.33:.1f}" fill="{ORANGE}"/>'
        f'<ellipse cx="{96 + _cx * 17.33 - _r * 17.33 * .25:.1f}" cy="{96 + _cy * 17.33 - _r * 17.33 * .35:.1f}" rx="{_r * 17.33 * .5:.1f}" ry="{_r * 17.33 * .3:.1f}" fill="#fff" opacity=".22"/>')
WORD = lambda x, period: (f'<text x="{x}" y="34" font-family="Instrument Serif, Times New Roman, serif" font-size="34" letter-spacing="-0.7" class="ink" fill="{INK_DARK}">Shotviva'
                          + (f'<tspan fill="{ORANGE}">.</tspan>' if period else '') + '</text>')

open('c-s-dot-small.svg', 'w').write(svg(16, SMALL))
open('c-s-dot-small-32.svg', 'w').write(svg(16, SMALL, 32))
open('c-s-dot-small-mono.svg', 'w').write(svg(16, MONO))
open('c-s-dot-icon-1024.svg', 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">{ICON}</svg>')
open('c-s-dot-lockup.svg', 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 48">{STYLE}{LOCKMARK}{WORD(52, True)}</svg>')
open('c-s-dot-lockup-tight.svg', 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 206 48">{STYLE}{LOCKMARK}{WORD(52, False)}</svg>')

# ---------- test page: the mark on a light tab bar, a dark tab bar and the sidebar, the icon at 180 / 512, the lock-ups, monochrome ----------
fav = lambda sz: f'<svg class="m" viewBox="0 0 16 16" width="{sz}" height="{sz}" aria-hidden="true">{SMALL}</svg>'
tab = lambda sz: f'<span class="tab"><span class="fav">{fav(sz)}</span><span class="tt">Shotviva · AI photo studio</span></span>'
side = lambda sz: f'<span class="si">{fav(sz)}<span class="sl">Shotviva</span></span>'
big = lambda sz: f'<figure><svg class="big" viewBox="0 0 1024 1024" width="{sz}" height="{sz}" aria-hidden="true">{ICON}</svg><figcaption>{sz}</figcaption></figure>'
html = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Shotviva · logo</title>
<link rel="icon" type="image/svg+xml" href="c-s-dot-small.svg">
<link rel="stylesheet" href="../comps-v3-b/css/studio.css">
<style>
  body {{ padding: 40px 32px 80px; }} body::after {{ display: none; }}
  h1 {{ font: 400 44px/1 var(--font-display); letter-spacing: -0.02em; }} h1 em {{ color: var(--primary); font-style: normal; }}
  .lede {{ margin-top: 12px; max-width: 70ch; color: var(--bone-dim); font-size: 15px; line-height: 1.6; }}
  .bars {{ display: grid; gap: 10px; margin-top: 28px; }}
  .bar {{ display: flex; align-items: center; gap: 18px; min-height: 44px; padding: 6px 12px; border-radius: 10px; font: 400 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }}
  .bar .lbl {{ width: 96px; font: 500 11px/1 var(--font-mono); letter-spacing: .06em; text-transform: uppercase; opacity: .6; }}
  .bar.light {{ background: #F1F3F4; color: #202124; --ink: {INK_LIGHT}; }}
  .bar.dark {{ background: #202124; color: #E8EAED; --ink: {INK_DARK}; }}
  .bar.side {{ background: #0B0A09; color: var(--foreground); box-shadow: inset 0 0 0 1px var(--border); --ink: {INK_DARK}; }}
  .tab {{ display: inline-flex; align-items: center; gap: 8px; height: 32px; padding: 0 12px; border-radius: 8px 8px 0 0; background: rgba(255,255,255,.55); }}
  .bar.dark .tab {{ background: #35363A; }}
  .fav {{ display: inline-grid; place-items: center; }} .tt {{ white-space: nowrap; }}
  .si {{ display: inline-flex; align-items: center; gap: 10px; padding: 0 8px; }} .sl {{ font: 500 14px/1 var(--font-sans); }}
  .m .ink {{ fill: var(--ink); }} .m .inks {{ stroke: var(--ink); }}
  .bigs {{ display: flex; flex-wrap: wrap; gap: 28px; align-items: flex-end; margin-top: 24px; }}
  figure {{ margin: 0; display: grid; gap: 8px; justify-items: center; }}
  figcaption {{ font: 400 12px/1 var(--font-mono); color: var(--muted-foreground); }}
  .big {{ border-radius: 22%; box-shadow: 0 20px 40px -24px rgba(0,0,0,.9); }}
  .lock {{ padding: 12px 16px; border-radius: 12px; background: var(--card); box-shadow: inset 0 0 0 1px var(--border); }}
  .lock svg .ink {{ fill: var(--foreground); }} .lock svg .inks {{ stroke: var(--foreground); }}
  .lock-light {{ background: #F1F3F4; }} .lock-light svg .ink {{ fill: {INK_LIGHT}; }} .lock-light svg .inks {{ stroke: {INK_LIGHT}; }} .lock-light figcaption {{ color: #666; }}
  .mono-row {{ display: inline-flex; gap: 14px; padding: 12px 16px; border-radius: 12px; background: #161311; box-shadow: inset 0 0 0 1px var(--border); }}
  .mono-ink .ink {{ fill: {INK_LIGHT}; }} .mono-ink .inks {{ stroke: {INK_LIGHT}; }} .mono-ink {{ background: {INK_DARK}; border-radius: 6px; }}
  .mono-bone .ink {{ fill: {INK_DARK}; }} .mono-bone .inks {{ stroke: {INK_DARK}; }}
  .mono-orange .ink {{ fill: {ORANGE}; }} .mono-orange .inks {{ stroke: {ORANGE}; }}
  .notes {{ margin-top: 48px; padding-top: 24px; border-top: 1px solid var(--border); max-width: 76ch; font-size: 14px; line-height: 1.6; color: var(--bone-dim); }}
</style></head>
<body>
<h1>Shotviva<em>.</em> logo</h1>
<p class="lede">The final mark, signed off 2026-11-07: "S." set in the wordmark's own face, Instrument Serif, with the period in safelight orange. Three optical weights: the app icon carries more weight than the mark beside the wordmark, and the favicon more still. The ink follows the tab bar; this page's favicon is the mark.</p>
<div class="bars">
  <div class="bar light"><span class="lbl">Light tab bar</span>{tab(16)}{tab(32)}</div>
  <div class="bar dark"><span class="lbl">Dark tab bar</span>{tab(16)}{tab(32)}</div>
  <div class="bar side"><span class="lbl">Sidebar</span>{side(16)}{side(32)}{side(48)}</div>
</div>
<div class="bigs">{big(180)}{big(512)}
  <figure class="lock"><svg viewBox="0 0 220 48" width="330" height="72" aria-label="Shotviva lock-up">{LOCKMARK}{WORD(52, True)}</svg><figcaption>lock-up</figcaption></figure>
  <figure class="lock"><svg viewBox="0 0 206 48" width="309" height="72" aria-label="Shotviva lock-up, tight">{LOCKMARK}{WORD(52, False)}</svg><figcaption>lock-up, tight (for the nav)</figcaption></figure>
  <figure class="lock lock-light"><svg viewBox="0 0 220 48" width="330" height="72" aria-label="Shotviva lock-up on light">{LOCKMARK}{WORD(52, True)}</svg><figcaption>on light</figcaption></figure>
  <figure><span class="mono-row"><svg class="m mono-ink" viewBox="0 0 16 16" width="32" height="32">{MONO}</svg><svg class="m mono-bone" viewBox="0 0 16 16" width="32" height="32">{MONO}</svg><svg class="m mono-orange" viewBox="0 0 16 16" width="32" height="32">{MONO}</svg></span><figcaption>monochrome: ink · bone · orange</figcaption></figure>
</div>
<div class="notes"><p>Files: <code>c-s-dot-small.svg</code> (favicon, 16/32), <code>-small-mono.svg</code>, <code>-icon-1024.svg</code> (app icon; 120 / 180 / 512 are scaled from it), <code>-lockup.svg</code>, <code>-lockup-tight.svg</code>; PNG exports in <code>export/c/</code>. Regenerate with <code>python3 gen.py</code>.</p></div>
</body></html>'''
open('test.html', 'w').write(html)
print('ok')
