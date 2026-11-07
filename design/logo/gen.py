# Shotviva logo marks, generated so the four directions share one grid, one stroke weight and one colour contract.
# Colours: ink (bone on dark, near-black on light: the SVG carries a prefers-color-scheme rule), orange = the wordmark's period.
import os
INK_DARK, INK_LIGHT, ORANGE, GROUND, GREY = '#F2ECE3', '#0B0A09', '#FF5B2E', '#0B0A09', '#2A2420'
STYLE = f'<style>.ink{{fill:{INK_DARK}}}.inks{{stroke:{INK_DARK}}}@media (prefers-color-scheme: light){{.ink{{fill:{INK_LIGHT}}}.inks{{stroke:{INK_LIGHT}}}}}</style>'

def fb(body):  # class="ink"/"inks" get a bone fallback attribute; the <style> rule still wins where CSS is supported
    return body.replace('class="ink inks"', 'class="ink inks" fill="#F2ECE3" stroke="#F2ECE3"').replace('class="ink"', 'class="ink" fill="#F2ECE3"').replace('class="inks"', 'class="inks" stroke="#F2ECE3"')
def svg(vb, body, w=None, extra=''):
    body = fb(body)
    size = f' width="{w}" height="{w}"' if w else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vb} {vb}"{size}>{extra}{body}</svg>'


# ---------- calligraphic strokes: a centre curve sampled, a width profile, the outline filled (thick-thin like the serif) ----------
import math
def bez(p0, p1, p2, p3, t):
    u = 1 - t
    return (u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0], u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1])
def ribbon(curve, width, t0=0.0, t1=1.0, n=90):
    """curve(t) -> (x, y); width(t) -> stroke width. Returns a filled path for t in [t0, t1]."""
    L, R = [], []
    for i in range(n + 1):
        t = t0 + (t1 - t0) * i / n
        x, y = curve(t); x2, y2 = curve(min(1, t + 1e-3)); x1, y1 = curve(max(0, t - 1e-3))
        dx, dy = x2 - x1, y2 - y1; ln = math.hypot(dx, dy) or 1; nx, ny = -dy / ln, dx / ln
        w = width(t) / 2
        L.append((x + nx * w, y + ny * w)); R.append((x - nx * w, y - ny * w))
    pts = L + R[::-1]
    return 'M' + ' '.join(f'{x:.2f} {y:.2f}' for x, y in pts) + 'Z'
# 1. the light trail: a near-closed loop, spiralling in a touch, thin at both ends, swelling through the sweep; the last reach is orange
def trail(t):
    a0, a1 = math.radians(-150), math.radians(165)
    a = a0 + (a1 - a0) * t; r = 19.5 - 3.5 * t
    return (24 + r * math.cos(a), 25 + r * math.sin(a))
trail_w = lambda t: 0.6 + 5.2 * math.sin(math.pi * min(1, t / 0.75)) ** 1.1 if t < 0.75 else 0.6 + 5.2 * (1 - (t - 0.75) / 0.25) ** 1.6 * 0.35
TRAIL_BONE = ribbon(trail, trail_w, 0, 0.76)
TRAIL_ORANGE = ribbon(trail, trail_w, 0.76, 1.0)
# 3. the swash: one pen stroke rising from the baseline and curling over at the top, with the period after it
def swash(t): return bez((5, 36), (16, 44), (30, 2), (41, 12), t)
swash_w = lambda t: 0.6 + 4.8 * math.sin(math.pi * (0.15 + 0.85 * t)) ** 1.4 * (1 - 0.35 * t)
SWASH = ribbon(swash, swash_w)


# ---------- C, refined: the S as one filled ribbon (slightly heavier through the spine, flat-cut terminals), the period sized to the stroke ----------
def chain(segs):
    """segs: list of (p0,p1,p2,p3) cubics; returns curve(t) over the whole chain, t in [0,1], equal time per segment."""
    n = len(segs)
    def f(t):
        t = min(max(t, 0), 1 - 1e-9); i = int(t * n); u = t * n - i
        return bez(*segs[i], u)
    return f
S_SEGS = [((31.6, 11.8), (29.2, 8.4), (25.4, 7.2), (21.4, 7.2)),
          ((21.4, 7.2), (14.6, 7.2), (10.2, 10.8), (10.2, 16.0)),
          ((10.2, 16.0), (10.2, 22.0), (15.4, 24.0), (21.8, 25.4)),
          ((21.8, 25.4), (28.4, 26.9), (33.8, 29.0), (33.8, 35.2)),
          ((33.8, 35.2), (33.8, 41.0), (28.6, 44.4), (22.0, 44.4)),
          ((22.0, 44.4), (17.0, 44.4), (12.6, 42.4), (10.2, 38.6))]
S_CURVE = chain(S_SEGS)
S_W = lambda t: 8.2 + 1.0 * math.sin(math.pi * t) ** 2 - 0.6 * (1 - abs(2 * t - 1)) ** 6
S_FILL = ribbon(S_CURVE, S_W, 0, 1, 180)
C_DOT = (41.8, 41.6, 4.3)


# ---------- C, set in the wordmark's own face: the S and the period are Instrument Serif's glyphs (instrument-S.json, extracted with fontTools) ----------
import json as _json
_IS = _json.load(open('instrument-S.json'))
FAT_ICON, FAT_LOCK, FAT_FAV = 80, 45, 110      # optical sizes: the icon carries more weight than the mark beside the wordmark; the favicon more still
def c_glyphs(fat, k, x0, y0, ink):
    """The Instrument Serif S thickened by `fat` font units, with the period set after it at the font's own advance. Returns (svg, dot cx, cy, r)."""
    tf = f'translate({x0 + fat * k / 2:.3f} {y0 + fat * k / 2 + 730 * k:.3f}) scale({k:.5f} {-k:.5f}) translate(-41 0)'
    w_s = (336 + fat) * k; dot_w = (105 + fat * .6) * k
    g = f'<g fill="{ink}" stroke="{ink}" stroke-width="{fat}" stroke-linejoin="round" stroke-linecap="round"><path d="{_IS["S"]}" transform="{tf}"/></g>'
    cx = x0 + w_s + 1.2 + dot_w / 2; cy = y0 + fat * k + 739 * k - dot_w / 2
    return g, cx, cy, dot_w / 2
def c_mark(ink, fat=FAT_LOCK, k=36 / 739, x0=None, y0=None, box=48):
    w = (336 + fat) * k + 1.2 + (105 + fat * .6) * k; h = (739 + fat) * k
    x0 = (box - w) / 2 if x0 is None else x0; y0 = (box - h) / 2 if y0 is None else y0
    g, cx, cy, r = c_glyphs(fat, k, x0, y0, ink)
    return g + f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{r:.2f}" fill="{ORANGE}"/>'
def c_parts(ink, fat, k, x0, y0): return c_glyphs(fat, k, x0, y0, ink)
# ---------- small marks (16-grid) ----------
MARK48 = {
 'c': c_mark('#F2ECE3', FAT_LOCK, 32 / 739, 2, 8).replace('fill="#F2ECE3" stroke="#F2ECE3"', 'class="ink inks"'),
 'y': f'<path d="{TRAIL_BONE}" class="ink"/><path d="{TRAIL_ORANGE}" fill="{ORANGE}"/>',
 'z': f'<circle cx="24" cy="24" r="19" fill="none" class="inks" stroke-width="1.3" stroke-dasharray="104 16" stroke-dashoffset="-22" stroke-linecap="round"/><circle cx="37.6" cy="10.9" r="4.2" fill="{ORANGE}"/>',
 'o': f'<path d="{SWASH}" class="ink"/><circle cx="43.5" cy="35" r="3.4" fill="{ORANGE}"/>',
}
SMALL = {
 # ---- round seven: linear marks that sit beside the thin serif. Each has a brand mark (MARK48) and this condensed favicon. ----
 # Y. the light trail (favicon: a thick 250° arc with an orange tip)
 'y': f'<path class="inks" d="M4.6 12.4A6.2 6.2 0 1 1 13.4 11" fill="none" stroke-width="2.3" stroke-linecap="round"/><path d="M13.4 11a6.2 6.2 0 0 1-1.6 2.3" fill="none" stroke="{ORANGE}" stroke-width="2.3" stroke-linecap="round"/>',
 # Z. the hairline and the lamp (favicon: a 2px open ring, the orange dot in the gap)
 'z': f'<circle cx="8" cy="8" r="5.6" fill="none" class="inks" stroke-width="2" stroke-dasharray="29 8" stroke-dashoffset="-6" stroke-linecap="round"/><circle cx="12.3" cy="3.9" r="2.2" fill="{ORANGE}"/>',
 # O. the swash (favicon: the stroke thickened, the period beside it)
 'o': f'<path d="M2 11.8C5 15.2 7.6 10.4 9.2 7.2S11.6 2.2 13 4.3" fill="none" class="inks" stroke-width="2.3" stroke-linecap="round"/><circle cx="13.3" cy="12.4" r="2" fill="{ORANGE}"/>',
 # ---- round six: rule-made forms. Each is one geometric rule with rhythm, not a picture of a thing. ----
 # T. emergence: a bone tile and, trailing from its corner, two squares shrinking into the dark; the picture forming
 't': f'<rect x="1.5" y="1.5" width="9" height="9" rx="2.8" class="ink"/><rect x="11" y="11" width="2.6" height="2.6" rx=".7" fill="{ORANGE}"/><rect x="13.6" y="13.6" width="1.4" height="1.4" rx=".4" fill="{ORANGE}" opacity=".7"/>',
 # U. the nest: a thick bone rounded-square ring, and inside it an orange tile resting bottom-right; the subject stays, the frame moves
 'u': f'<rect x="2.3" y="2.3" width="11.4" height="11.4" rx="3.4" fill="none" class="inks" stroke-width="2.2"/><rect x="7.2" y="7.2" width="4.6" height="4.6" rx="1.3" fill="{ORANGE}"/>',
 # V. the lamp: eight rays of two lengths around an empty centre, one ray orange: the safelight in the dark
 'v': '<rect x="7" y="1" width="2" height="5.2" rx="1" fill="#FF5B2E" transform="rotate(0 8 8)"/><rect x="7" y="1" width="2" height="3.6" rx="1" class="ink" transform="rotate(45 8 8)"/><rect x="7" y="1" width="2" height="5.2" rx="1" class="ink" transform="rotate(90 8 8)"/><rect x="7" y="1" width="2" height="3.6" rx="1" class="ink" transform="rotate(135 8 8)"/><rect x="7" y="1" width="2" height="5.2" rx="1" class="ink" transform="rotate(180 8 8)"/><rect x="7" y="1" width="2" height="3.6" rx="1" class="ink" transform="rotate(225 8 8)"/><rect x="7" y="1" width="2" height="5.2" rx="1" class="ink" transform="rotate(270 8 8)"/><rect x="7" y="1" width="2" height="3.6" rx="1" class="ink" transform="rotate(315 8 8)"/>',
 # W. the links: two rounded-square outlines interlocked, bone and orange: before and after, joined
 'w': f'<rect x="1.5" y="4" width="8.5" height="8.5" rx="2.6" fill="none" class="inks" stroke-width="2.1"/><rect x="6" y="3.5" width="8.5" height="8.5" rx="2.6" fill="none" stroke="{ORANGE}" stroke-width="2.1"/><path d="M6 6.1v3.3" fill="none" class="inks" stroke-width="2.1"/><path d="M9.5 9.7h-1" fill="none" class="inks" stroke-width="2.1"/>',
 # X. the tide: a tile split by one soft diagonal wave, bone above, orange below; the developer rising
 'x': f'<rect x="1.5" y="1.5" width="13" height="13" rx="3.5" fill="{ORANGE}"/><path d="M5 1.5h9.5v4.2C11.5 4.4 10.2 9 7.3 9.4S3.2 7.2 1.5 9.6V5A3.5 3.5 0 0 1 5 1.5z" class="ink"/>',
 # ---- round five: abstract symbols, no letters, no photo clichés ----
 # P. the overlap: two bone tiles, one behind the other, offset sideways; where they share ground the orange shows. "The subject stays; the look changes."
 'p': f'<rect x="1.5" y="3" width="9" height="10" rx="2.6" class="ink"/><rect x="5.5" y="3" width="9" height="10" rx="2.6" class="ink"/><path d="M5.5 3h5v10h-5z" fill="{ORANGE}"/>',
 # Q. the turn: a bone disc, its right edge turned to orange, a crescent: the moment the light changes
 'q': f'<circle cx="8" cy="8" r="6.6" class="ink"/><path d="M8.6 1.5A6.6 6.6 0 0 1 8.6 14.5A9 9 0 0 0 8.6 1.5z" fill="{ORANGE}"/>',
 # R. the bloom: five rounded petals around an orange centre; the shutter, but drawn as a flower would be
 'r': ''.join(f'<rect x="6.6" y="1" width="2.8" height="6.2" rx="1.4" class="ink" transform="rotate({a} 8 8)"/>' for a in (0, 72, 144, 216, 288)) + f'<circle cx="8" cy="8" r="2.3" fill="{ORANGE}"/>',
 # S. the set: three tiles fanned from one pivot at the bottom, the front one orange: one photo, a set
 's': f'<rect x="5.2" y="2" width="5.6" height="8.5" rx="1.6" class="ink" opacity=".55" transform="rotate(-22 8 13)"/><rect x="5.2" y="2" width="5.6" height="8.5" rx="1.6" class="ink" opacity=".8" transform="rotate(22 8 13)"/><rect x="5.2" y="1.5" width="5.6" height="9" rx="1.6" fill="{ORANGE}"/>',
 # H. the pair: two prints, the second shifted down-right and orange; the staggered silhouette is an S. Before / after, as one shape.
 'h': f'<rect x="1.5" y="1.5" width="8.5" height="8" rx="2.2" class="ink"/><rect x="6" y="6.5" width="8.5" height="8" rx="2.2" fill="{ORANGE}"/><rect x="6" y="6.5" width="4" height="3" fill="{GROUND}" opacity=".35"/>',
 # I. the S seam: a rounded square split by one S-shaped seam, bone on the left, orange on the right
 'i': f'<rect x="1.5" y="1.5" width="13" height="13" rx="3.5" fill="{ORANGE}"/><path d="M5 1.5h5.4C6.6 1.5 5.9 4.3 8.4 6.1S11 10.6 6.2 14.5H5A3.5 3.5 0 0 1 1.5 11V5A3.5 3.5 0 0 1 5 1.5z" class="ink"/>',
 # Sv variants. The S is ink, the v is orange ("viva"); they share one stroke weight and touch or flow into each other. No dot.
 # K. nested: the v hangs from the S's last curve, its right arm is the S itself
 'k': f'<path class="inks" d="M11.3 4.2C10.6 2.9 9.4 2.3 7.8 2.3 5.5 2.3 4 3.5 4 5s1.4 2.1 3.6 2.6c2.3.5 3.9 1.3 3.9 3 0 1.8-1.6 3.1-3.6 3.1" fill="none" stroke-width="2.3" stroke-linecap="round"/><path d="M7.9 13.7L5.2 9.4" fill="none" stroke="{ORANGE}" stroke-width="2.3" stroke-linecap="round"/>',
 # L. V bottom: the S's upper bowl, then the stroke goes straight into a V
 'l': f'<path class="inks" d="M11.2 4C10.5 2.8 9.3 2.3 7.7 2.3 5.4 2.3 3.9 3.5 3.9 5s1.4 2.1 3.6 2.6L11.6 8.6" fill="none" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M11.6 8.6L8 13.9 4.1 9.9" fill="none" stroke="{ORANGE}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>',
 # M. cradle: a wide orange V holds the S
 'm': f'<path class="inks" d="M10.4 3.4C9.9 2.6 9 2.2 7.9 2.2 6.2 2.2 5 3.1 5 4.2s1 1.6 2.7 2c1.8.4 3 1 3 2.3 0 1.4-1.2 2.3-2.8 2.3-1.3 0-2.2-.5-2.8-1.3" fill="none" stroke-width="2.2" stroke-linecap="round"/><path d="M2.6 10.3L8 14.6l5.4-4.3" fill="none" stroke="{ORANGE}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>',
 # N. tick: the S runs out into a check-mark v, the "shot, done"
 'n': f'<path class="inks" d="M10.6 3.9C10 2.8 8.9 2.3 7.5 2.3 5.4 2.3 4 3.4 4 4.8s1.3 2 3.3 2.5c2 .5 3.3 1.3 3.3 2.7 0 1.3-1 2.2-2.3 2.4" fill="none" stroke-width="2.3" stroke-linecap="round"/><path d="M8.3 12.4l1.6 2.1 4.3-6.7" fill="none" stroke="{ORANGE}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>',
 # ---- earlier rounds, kept for comparison ----
 'e': f'<rect x="5.2" y="1.2" width="5.6" height="8.6" rx="1.6" class="ink"/><circle cx="8" cy="13.4" r="2.3" fill="{ORANGE}"/>',
 'f': f'<path d="M3.5 1.5h6l5 5v6a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z" class="ink"/><path d="M9.5 1.5v3.5a1.5 1.5 0 0 0 1.5 1.5h3.5z" fill="{ORANGE}"/>',
 'g': f'<circle cx="8" cy="8" r="6.8" fill="{ORANGE}"/><path d="M8 1.2A6.8 6.8 0 0 0 8 14.8A3.4 3.4 0 0 0 8 8A3.4 3.4 0 0 1 8 1.2Z" class="ink"/>',
 'a': f'<path class="inks" d="M1.5 6.5V1.5h5M9.5 1.5h5v5M14.5 9.5v5h-5M6.5 14.5h-5v-5" fill="none" stroke-width="2"/><circle cx="8" cy="8" r="2.6" fill="{ORANGE}"/>',
 'b': f'<rect x="1.5" y="1.5" width="13" height="13" rx="3.5" fill="{INK_DARK}"/><path d="M5 1.5h-.5A3.5 3.5 0 0 0 1.5 5v6a3.5 3.5 0 0 0 3 3.5h2.7V1.5z" fill="{GREY}"/><rect x="6.7" y="1.5" width="2" height="13" fill="{ORANGE}"/><rect x="1.5" y="1.5" width="13" height="13" rx="3.5" fill="none" class="inks" stroke-width="1"/>',
 'c': '<g transform="scale(.3333)">' + c_mark('#F2ECE3', FAT_FAV, 38 / 739).replace('fill="#F2ECE3" stroke="#F2ECE3"', 'class="ink inks"') + '</g>',
 'd': f'<path class="inks" d="M11 2.5H3.5a1 1 0 0 0-1 1V7a1 1 0 0 0 1 1H10a1 1 0 0 1 1 1v3.5a1 1 0 0 1-1 1H2.5" fill="none" stroke-width="2" stroke-linejoin="round"/><circle cx="13.7" cy="13.3" r="2" fill="{ORANGE}"/>',
}
# ---------- large marks (1024, app icon: the ground is the darkroom, subtle depth allowed) ----------
GLOW = f'<defs><filter id="g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="26"/></filter><linearGradient id="lip" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".08"/><stop offset=".3" stop-color="#fff" stop-opacity="0"/></linearGradient><linearGradient id="bone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FAF6EF"/><stop offset="1" stop-color="#E8E0D4"/></linearGradient></defs>'
BG = f'<rect width="1024" height="1024" rx="224" fill="{GROUND}"/><rect width="1024" height="1024" rx="224" fill="url(#lip)"/>'
def dot(cx, cy, r): return f'<circle cx="{cx}" cy="{cy}" r="{r*1.6}" fill="{ORANGE}" opacity=".35" filter="url(#g)"/><circle cx="{cx}" cy="{cy}" r="{r}" fill="{ORANGE}"/><ellipse cx="{cx-r*.25}" cy="{cy-r*.35}" rx="{r*.5}" ry="{r*.3}" fill="#fff" opacity=".22"/>'
LARGE = {
 **{k: BG + f'<g transform="translate(112 112) scale(16.67)">' + MARK48[k].replace('class="inks"', f'stroke="{INK_DARK}"').replace('class="ink"', f'fill="{INK_DARK}"') + '</g>' for k in 'yzo'},
 **{k: BG + f'<g transform="translate(112 112) scale(50)">' + SMALL[k].replace('class="inks"', f'stroke="{INK_DARK}"').replace('class="ink"', f'fill="{INK_DARK}"') + '</g>' for k in 'tuvwx'},
 **{k: BG + f'<g transform="translate(112 112) scale(50)">' + SMALL[k].replace('class="ink"', f'fill="{INK_DARK}"') + '</g>' for k in 'pqrs'},
 'h': BG + f'<rect x="196" y="196" width="440" height="412" rx="96" fill="#000" opacity=".4" filter="url(#g)"/><rect x="186" y="186" width="440" height="412" rx="96" fill="url(#bone)"/><rect x="398" y="420" width="440" height="412" rx="96" fill="{ORANGE}" opacity=".45" filter="url(#g)"/><rect x="398" y="420" width="440" height="412" rx="96" fill="{ORANGE}"/><rect x="398" y="420" width="228" height="178" fill="{GROUND}" opacity=".3"/>',
 'i': BG + f'<rect x="192" y="192" width="640" height="640" rx="140" fill="{ORANGE}"/><g transform="translate(118 118) scale(49.23)"><path d="M5 1.5h5.4C6.6 1.5 5.9 4.3 8.4 6.1S11 10.6 6.2 14.5H5A3.5 3.5 0 0 1 1.5 11V5A3.5 3.5 0 0 1 5 1.5z" fill="url(#bone)"/><path d="M10.4 1.5C6.6 1.5 5.9 4.3 8.4 6.1S11 10.6 6.2 14.5" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width=".12"/><path d="M10.4 1.5C6.6 1.5 5.9 4.3 8.4 6.1S11 10.6 6.2 14.5" fill="none" stroke="#000" stroke-opacity=".18" stroke-width=".12" transform="translate(.12 .1)"/></g>',
 **{k: BG + f'<g transform="translate(112 112) scale(50)">' + SMALL[k].replace('class="inks"', f'stroke="{INK_DARK}"').replace('class="ink"', f'fill="{INK_DARK}"') + '</g>' for k in 'klmn'},
 'e': BG + f'<defs><linearGradient id="undev" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3A332D"/><stop offset="1" stop-color="#211D1A"/></linearGradient></defs>'
      f'<g transform="rotate(-4 512 470)"><rect x="336" y="130" width="352" height="520" rx="34" fill="#000" opacity=".35" filter="url(#g)"/><rect x="332" y="118" width="360" height="520" rx="34" fill="url(#bone)"/>'
      f'<rect x="366" y="152" width="292" height="376" rx="14" fill="url(#undev)"/><rect x="366" y="152" width="292" height="376" rx="14" fill="url(#lip)"/>'
      f'<rect x="366" y="152" width="292" height="376" rx="14" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="2"/></g>' + dot(512, 836, 112),
 'f': BG + f'<path d="M264 180h352l228 228v372a84 84 0 0 1-84 84H264a84 84 0 0 1-84-84V264a84 84 0 0 1 84-84z" fill="url(#bone)"/><path d="M616 180v148a80 80 0 0 0 80 80h148z" fill="{ORANGE}"/><path d="M616 180v148a80 80 0 0 0 80 80h148z" fill="{ORANGE}" opacity=".5" filter="url(#g)"/><path d="M616 328a80 80 0 0 0 80 80h148" fill="none" stroke="#000" stroke-opacity=".18" stroke-width="10"/>',
 'g': BG + f'<circle cx="512" cy="512" r="400" fill="{ORANGE}"/><circle cx="512" cy="512" r="440" fill="{ORANGE}" opacity=".3" filter="url(#g)"/><path d="M512 112A400 400 0 0 0 512 912A200 200 0 0 0 512 512A200 200 0 0 1 512 112Z" fill="url(#bone)"/>',
 'a': BG + f'<path d="M232 400V232h168M624 232h168v168M792 624v168H624M400 792H232V624" fill="none" stroke="{INK_DARK}" stroke-width="64"/>' + dot(512, 512, 118),
 'b': BG + f'<rect x="192" y="192" width="640" height="640" rx="140" fill="url(#bone)"/><path d="M460 192H332a140 140 0 0 0-140 140v360a140 140 0 0 0 140 140h128z" fill="{GREY}"/><rect x="460" y="192" width="64" height="640" fill="{ORANGE}"/><rect x="460" y="192" width="64" height="640" fill="{ORANGE}" opacity=".5" filter="url(#g)"/>',
 'c': BG + (lambda p: f'<g transform="translate(96 96) scale(17.33)">{p[0]}</g>' + dot(96 + p[1] * 17.33, 96 + p[2] * 17.33, p[3] * 17.33))(c_parts(INK_DARK, FAT_ICON, 40 / 739, (48 - ((336 + FAT_ICON) * 40 / 739 + 1.2 + (105 + FAT_ICON * .6) * 40 / 739)) / 2, (48 - (739 + FAT_ICON) * 40 / 739) / 2)),
 'd': BG + f'<path d="M700 212H240a60 60 0 0 0-60 60v170a60 60 0 0 0 60 60h420a60 60 0 0 1 60 60v190a60 60 0 0 1-60 60H180" fill="none" stroke="{INK_DARK}" stroke-width="110" stroke-linejoin="round" stroke-linecap="butt"/>' + dot(864, 812, 94),
}
# mono: everything in one ink (no orange), for stamps, embroidery, single-colour print
def mono(body): return body.replace(f'stroke="{ORANGE}"', 'class="inks"').replace(f'<rect x="6" y="6.5" width="4" height="3" fill="{GROUND}" opacity=".35"/>', '').replace(f'<rect x="6" y="6.5" width="8.5" height="8" rx="2.2" fill="{ORANGE}"/>', '<rect x="6.5" y="7" width="7.5" height="7" rx="1.8" fill="none" class="inks" stroke-width="1"/>').replace(f'<rect x="1.5" y="1.5" width="13" height="13" rx="3.5" fill="{ORANGE}"/>', '<rect x="2" y="2" width="12" height="12" rx="3" fill="none" class="inks" stroke-width="1"/>').replace(f'<circle cx="8" cy="8" r="6.8" fill="{ORANGE}"/>', '<circle cx="8" cy="8" r="6.3" fill="none" class="inks" stroke-width="1"/>').replace(f'fill="{ORANGE}"', 'class="ink"').replace(f'fill="{GREY}"', 'fill="none" class="inks" stroke-width="1"')
NAMES = {'y': 'light-trail', 'z': 'hairline-lamp', 'o': 'swash', 't': 'emergence', 'u': 'the-nest', 'v': 'the-lamp', 'w': 'the-links', 'x': 'the-tide', 'p': 'the-overlap', 'q': 'the-turn', 'r': 'the-bloom', 's': 'the-set', 'i': 's-seam-square', 'k': 'sv-nested', 'l': 'sv-v-bottom', 'm': 'sv-cradle', 'n': 'sv-tick', 'h': 'the-pair', 'e': 'viva-print', 'f': 'folded-corner', 'g': 's-seam', 'a': 'viewfinder-dot', 'b': 'half-developed', 'c': 's-dot', 'd': 'squared-s-dot'}
for k, n in NAMES.items():
    open(f'{k}-{n}-small.svg', 'w').write(svg(16, SMALL[k], None, STYLE))
    open(f'{k}-{n}-small-32.svg', 'w').write(svg(16, SMALL[k], 32, STYLE))
    open(f'{k}-{n}-small-mono.svg', 'w').write(svg(16, mono(SMALL[k]), None, STYLE))
    open(f'{k}-{n}-icon-1024.svg', 'w').write(svg(1024, LARGE[k], None, GLOW))
    # lockup: mark + wordmark (text; the build converts the wordmark to paths)
    markpart = f'<g transform="translate(2 6) scale(.78)">{fb(MARK48[k])}</g>' if k in MARK48 else f'<g transform="translate(4 8) scale(2)">{SMALL[k]}</g>'
    lock = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 48">{STYLE}{markpart}'
            f'<text x="52" y="34" font-family="Instrument Serif, Times New Roman, serif" font-size="34" letter-spacing="-0.7" class="ink">Shotviva<tspan fill="{ORANGE}">.</tspan></text></svg>')
    open(f'{k}-{n}-lockup.svg', 'w').write(lock)
    if k == 'c':
        lockc = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 206 48">{STYLE}<g transform="translate(2 5) scale(.8)">{fb(MARK48[k])}</g>'
                 f'<text x="50" y="34" font-family="Instrument Serif, Times New Roman, serif" font-size="34" letter-spacing="-0.7" class="ink">Shotviva</text></svg>')
        open(f'{k}-{n}-lockup-tight.svg', 'w').write(lockc)
    if k == 'e':
        lock2 = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 172 48">{STYLE}'
                 f'<text x="4" y="34" font-family="Instrument Serif, Times New Roman, serif" font-size="34" letter-spacing="-0.7" class="ink">Shotviva</text>'
                 f'<g transform="translate(136 8) scale(1.75)">{fb(SMALL[k])}</g></svg>')
        open(f'{k}-{n}-lockup-viva.svg', 'w').write(lock2)
print('svgs written:', len(os.listdir('.')))

# ---------- round eight: ten styles (ten.py) ----------
import ten as _ten
TEN = _ten.build(ORANGE, GROUND, INK_DARK, INK_LIGHT)
for n, (name, big, small) in TEN.items():
    slug = f'{n:02d}-' + name.lower().replace(' ', '-')
    open(f'{slug}-big.svg', 'w').write(svg(48, big, None, STYLE))
    open(f'{slug}-small.svg', 'w').write(svg(16, small, None, STYLE))
ten_cards = lambda: _ten.cards(TEN)

# ---------- test page: every option at 16 / 32 / 48 / 180 / 512, on a light tab bar, a dark tab bar and the dark sidebar; mono row; lockups ----------
def inl(body, size, cls=''):  # inline svg so the ink colour follows the mock bar, not the OS scheme
    return f'<svg class="m {cls}" viewBox="0 0 16 16" width="{size}" height="{size}" aria-hidden="true">{body}</svg>'
def inl_big(body, size):
    return f'<svg class="big" viewBox="0 0 1024 1024" width="{size}" height="{size}" aria-hidden="true">{GLOW}{body}</svg>'
rows = ''
for k, n in NAMES.items():
    if k == 't': rows += '<h2 class="prev">Earlier rounds, for comparison</h2>'
    if k == 'i': rows += '<h2 class="prev">Round four (letters), for comparison</h2>'
    if k == 'h': rows += '<h2 class="prev">Earlier rounds, for comparison</h2>'
    if k == 'a': rows += '<h2 class="prev">Round one, for comparison</h2>'
    tab_l = ''.join(f'<span class="tab"><span class="fav">{inl(SMALL[k], s)}</span><span class="tt">Shotviva · AI photo studio</span></span>' for s in (16, 32))
    tab_d = ''.join(f'<span class="tab"><span class="fav">{inl(SMALL[k], s)}</span><span class="tt">Shotviva · AI photo studio</span></span>' for s in (16, 32))
    side = ''.join(f'<span class="si">{inl(SMALL[k], s)}<span class="sl">Shotviva</span></span>' for s in (16, 32, 48))
    big = ''.join(f'<figure>{inl_big(LARGE[k], s)}<figcaption>{s}</figcaption></figure>' for s in (180, 512))
    monos = inl(mono(SMALL[k]), 32, 'mono-ink') + inl(mono(SMALL[k]), 32, 'mono-bone') + inl(mono(SMALL[k]), 32, 'mono-orange')
    rows += f'''<section class="opt" id="opt-{k}">
  <h2><span>{k.upper()}</span>{n.replace('-', ' ')}</h2>
  <div class="bars">
    <div class="bar light"><span class="lbl">Light tab bar</span>{tab_l}</div>
    <div class="bar dark"><span class="lbl">Dark tab bar</span>{tab_d}</div>
    <div class="bar side"><span class="lbl">Sidebar</span>{side}</div>
  </div>
  <div class="bigs">{big}
    <figure class="lock"><svg viewBox="0 0 220 48" width="330" height="72" aria-label="Shotviva lockup">{('<g transform="translate(2 6) scale(.78)">' + MARK48[k] + '</g>') if k in MARK48 else ('<g transform="translate(4 8) scale(2)">' + SMALL[k] + '</g>')}<text x="52" y="34" font-family="Instrument Serif" font-size="34" letter-spacing="-0.7" class="ink">Shotviva<tspan fill="{ORANGE}">.</tspan></text></svg><figcaption>lock-up</figcaption></figure>
    {'<figure class="lock"><svg viewBox="0 0 172 48" width="258" height="72" aria-label="Shotviva lockup, integrated"><text x="4" y="34" font-family="Instrument Serif" font-size="34" letter-spacing="-0.7" class="ink">Shotviva</text><g transform="translate(136 8) scale(1.75)">' + SMALL[k] + '</g></svg><figcaption>lock-up, the mark as the last stroke</figcaption></figure>' if k == 'e' else ''}
    <figure class="monos"><span class="mono-row">{monos}</span><figcaption>monochrome: ink · bone · orange</figcaption></figure>
  </div>
</section>'''
html = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Shotviva · logo test</title>
<link rel="icon" type="image/svg+xml" href="f-folded-corner-small.svg">
<link rel="stylesheet" href="../comps-v3-b/css/studio.css">
<style>
  body {{ padding: 40px 32px 80px; }} body::after {{ display: none; }}
  h1 {{ font: 400 44px/1 var(--font-display); letter-spacing: -0.02em; }} h1 em {{ color: var(--primary); font-style: normal; }}
  .lede {{ margin-top: 12px; max-width: 70ch; color: var(--bone-dim); font-size: 15px; line-height: 1.6; }}
  .opt {{ margin-top: 48px; padding-top: 28px; border-top: 1px solid var(--border); }}
  .opt h2 {{ display: flex; gap: 12px; align-items: baseline; font: 600 17px/1.3 var(--font-sans); text-transform: capitalize; }}
  .opt h2 span {{ font: 400 14px/1 var(--font-mono); color: var(--primary); }}
  .bars {{ display: grid; gap: 10px; margin-top: 16px; }}
  .bar {{ display: flex; align-items: center; gap: 18px; min-height: 44px; padding: 6px 12px; border-radius: 10px; font: 400 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }}
  .bar .lbl {{ width: 96px; font: 500 11px/1 var(--font-mono); letter-spacing: .06em; text-transform: uppercase; opacity: .6; }}
  .bar.light {{ background: #F1F3F4; color: #202124; --ink: {INK_LIGHT}; }}
  .bar.dark {{ background: #202124; color: #E8EAED; --ink: {INK_DARK}; }}
  .bar.side {{ background: #0B0A09; color: var(--foreground); box-shadow: inset 0 0 0 1px var(--border); --ink: {INK_DARK}; }}
  .tab {{ display: inline-flex; align-items: center; gap: 8px; height: 32px; padding: 0 12px; border-radius: 8px 8px 0 0; background: rgba(255,255,255,.55); }}
  .bar.dark .tab {{ background: #35363A; }}
  .fav {{ display: inline-grid; place-items: center; }}
  .tt {{ white-space: nowrap; }}
  .si {{ display: inline-flex; align-items: center; gap: 10px; padding: 0 8px; }} .sl {{ font: 500 14px/1 var(--font-sans); }}
  .m .ink {{ fill: var(--ink); }} .m .inks {{ stroke: var(--ink); }}
  .bigs {{ display: flex; flex-wrap: wrap; gap: 28px; align-items: flex-end; margin-top: 20px; }}
  figure {{ margin: 0; display: grid; gap: 8px; justify-items: center; }}
  figcaption {{ font: 400 12px/1 var(--font-mono); color: var(--muted-foreground); }}
  .big .ink {{ fill: {INK_DARK}; }} .big .inks {{ stroke: {INK_DARK}; }}
  .big {{ border-radius: 22%; box-shadow: 0 20px 40px -24px rgba(0,0,0,.9); }}
  .lock svg .ink {{ fill: var(--foreground); }} .lock svg .inks {{ stroke: var(--foreground); }}
  .lock-light {{ background: #F1F3F4; }} .lock-light svg .ink {{ fill: {INK_LIGHT}; }} .lock-light svg .inks {{ stroke: {INK_LIGHT}; }} .lock-light figcaption {{ color: #666; }}
  .lock {{ padding: 12px 16px; border-radius: 12px; background: var(--card); box-shadow: inset 0 0 0 1px var(--border); }}
  .mono-row {{ display: inline-flex; gap: 14px; padding: 12px 16px; border-radius: 12px; background: #161311; box-shadow: inset 0 0 0 1px var(--border); }}
  .mono-ink .ink {{ fill: {INK_LIGHT}; }} .mono-ink .inks {{ stroke: {INK_LIGHT}; }} .mono-ink {{ background: {INK_DARK}; border-radius: 6px; }}
  .mono-bone .ink {{ fill: {INK_DARK}; }} .mono-bone .inks {{ stroke: {INK_DARK}; }}
  .mono-orange .ink {{ fill: {ORANGE}; }} .mono-orange .inks {{ stroke: {ORANGE}; }}
  .prev {{ margin-top: 64px; font: 400 28px/1 var(--font-display); color: var(--muted-foreground); }}
  .ten {{ margin-top: 40px; }}
  .ten-h {{ font: 400 36px/1 var(--font-display); letter-spacing: -0.02em; margin-bottom: 20px; }}
  .tgrid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(216px, 1fr)); gap: 16px; }}
  .tcard {{ padding: 12px; border-radius: 18px; background: var(--card); box-shadow: inset 0 0 0 1px var(--border); display: grid; gap: 10px; justify-items: center; }}
  .tbig {{ width: 192px; height: 192px; border-radius: 42px; display: grid; place-items: center; background: #0B0A09; box-shadow: inset 0 0 0 1px var(--border); }}
  .tbig .ink {{ fill: {INK_DARK}; }} .tbig .inks {{ stroke: {INK_DARK}; }}
  .tfav {{ display: flex; gap: 8px; }}
  .chip {{ display: inline-flex; align-items: center; gap: 10px; height: 44px; padding: 0 12px; border-radius: 10px; }}
  .chip.light {{ background: #F1F3F4; --ink: {INK_LIGHT}; }} .chip.dark {{ background: #202124; --ink: {INK_DARK}; }}
  .tcard h3 {{ display: flex; gap: 10px; align-items: baseline; font: 500 15px/1.2 var(--font-sans); }}
  .tcard h3 span {{ font: 400 22px/1 var(--font-display); color: var(--primary); }}
  .notes {{ margin-top: 48px; padding-top: 24px; border-top: 1px solid var(--border); max-width: 76ch; font-size: 14px; line-height: 1.6; color: var(--bone-dim); }}
  .notes b {{ color: var(--foreground); font-weight: 500; }}
</style></head>
<body>
<h1>Shotviva<em>.</em> logo marks</h1>
<p class="lede">Ten abstract marks in ten styles, numbered: say a number. Every earlier round is kept below for comparison.</p>
{ten_cards()}
{rows}
<div class="notes">
  <p><b>Files</b> in design/logo/: <code>&lt;x&gt;-&lt;name&gt;-small.svg</code> (favicon, 16/32), <code>-small-mono.svg</code>, <code>-icon-1024.svg</code> (app icon, also 180 / 512), <code>-lockup.svg</code> (mark + wordmark; the wordmark is live text here and is converted to paths in the build). <b>Google OAuth</b> wants a 120×120 logo and re-verifies on change: pick before that upload.</p>
</div>
</body></html>'''
open('test.html', 'w').write(html); print('test.html ok')
