# Round eight: ten abstract marks in ten styles (48-grid big, 16-grid favicon). The Owner picks by number.
import math as _m

def build(ORANGE, GROUND, INK_DARK, INK_LIGHT):
    def scallop(cx, cy, r, n, br):
        return ''.join(f'<circle cx="{cx + r*_m.cos(2*_m.pi*i/n):.2f}" cy="{cy + r*_m.sin(2*_m.pi*i/n):.2f}" r="{br}" class="ink"/>' for i in range(n))
    facets = [((24,4),(40,18)),((40,18),(32,44)),((32,44),(16,44)),((16,44),(8,18)),((8,18),(24,4))]
    fop = [1, .72, .5, .62, .86]
    crystal = ''.join(f'<path d="M{a[0]} {a[1]}L{b[0]} {b[1]}L24 22Z" class="ink" opacity="{o}"/>' for (a, b), o in zip(facets, fop))
    crystal = crystal.replace('<path d="M32 44L16 44L24 22Z" class="ink" opacity="0.5"/>', f'<path d="M32 44L16 44L24 22Z" fill="{ORANGE}"/>')
    pix = ''.join(f'<rect x="{x}" y="{y}" width="{w}" height="{w}" rx="{w*.22:.1f}" class="ink"/>' for x, y, w in [(5,5,12),(21,6,10),(35,7,8),(6,21,10),(22,22,8),(36,23,6),(7,36,8),(23,37,6),(37,38,4)])
    pix = pix.replace('<rect x="5" y="5" width="12" height="12" rx="2.6" class="ink"/>', f'<rect x="5" y="5" width="12" height="12" rx="2.6" fill="{ORANGE}"/>')
    planes = ''.join(f'<rect x="11" y="11" width="26" height="26" rx="6" class="ink" opacity=".3" transform="rotate({a} 24 24)"/>' for a in (0, 22, 44))
    TEN = {
     1: ('Soft blob',
         f'<path d="M22 5C33 3 44 12 42 24S30 44 19 42 4 32 6 20 12 7 22 5Z" class="ink"/><path d="M31 27c4-1 8 2 8 6s-4 8-9 7-7-4-6-8 3-4 7-5z" fill="{ORANGE}"/>',
         f'<path d="M7.5 1.6C11.5 1 15 4 14.4 8S10.2 14.8 6.5 14 1.2 10.5 1.8 6.6 4 2.2 7.5 1.6Z" class="ink"/><circle cx="10.8" cy="10.6" r="2.6" fill="{ORANGE}"/>'),
     2: ('Glass orb',
         f'<defs><radialGradient id="orb" cx=".38" cy=".3" r=".75"><stop offset="0" stop-color="#FFFDF8"/><stop offset=".55" stop-color="#E6DED2"/><stop offset="1" stop-color="#8E8578"/></radialGradient><radialGradient id="core" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFB08F"/><stop offset=".6" stop-color="{ORANGE}"/><stop offset="1" stop-color="{ORANGE}" stop-opacity="0"/></radialGradient></defs><circle cx="24" cy="24" r="19" fill="url(#orb)"/><circle cx="24" cy="26" r="9" fill="url(#core)"/><ellipse cx="18" cy="14" rx="6" ry="3.6" fill="#fff" opacity=".55" transform="rotate(-25 18 14)"/>',
         f'<circle cx="8" cy="8" r="6.6" class="ink"/><circle cx="8" cy="8.6" r="2.8" fill="{ORANGE}"/>'),
     3: ('Pleated fan',
         f'<path d="M6 42L12 8 18 42Z" class="ink" opacity=".55"/><path d="M18 42L12 8 24 6 30 42Z" class="ink"/><path d="M30 42L24 6 36 8 42 42Z" class="ink" opacity=".55"/><path d="M24 6L30 42" stroke="{ORANGE}" stroke-width="2.2" stroke-linecap="round"/>',
         f'<path d="M1.5 14.5L4 2.5 7 14.5Z" class="ink" opacity=".55"/><path d="M7 14.5L4 2.5 8 1.5 11 14.5Z" class="ink"/><path d="M11 14.5L8 1.5 12.5 2.5 14.5 14.5Z" class="ink" opacity=".55"/><path d="M8 1.5L11 14.5" stroke="{ORANGE}" stroke-width="1.6" stroke-linecap="round"/>'),
     4: ('Cut-out',
         f'<path fill-rule="evenodd" d="M16 4h16a12 12 0 0 1 12 12v16a12 12 0 0 1-12 12H16A12 12 0 0 1 4 32V16A12 12 0 0 1 16 4zm2 30c0-14 8-20 18-22 0 14-8 20-18 22z" class="ink"/><circle cx="26" cy="22" r="3" fill="{ORANGE}"/>',
         f'<path fill-rule="evenodd" d="M5.5 1.5h5a4 4 0 0 1 4 4v5a4 4 0 0 1-4 4h-5a4 4 0 0 1-4-4v-5a4 4 0 0 1 4-4zm.5 10c0-4.5 2.8-6.8 6-7.5 0 4.5-2.8 6.8-6 7.5z" class="ink"/><circle cx="8.8" cy="7.2" r="1.3" fill="{ORANGE}"/>'),
     5: ('Layered planes',
         planes + f'<rect x="11" y="11" width="26" height="26" rx="6" fill="{ORANGE}" opacity=".85" transform="rotate(-22 24 24)"/>',
         f'<rect x="3" y="3" width="10" height="10" rx="2.5" class="ink" opacity=".55" transform="rotate(30 8 8)"/><rect x="3" y="3" width="10" height="10" rx="2.5" class="ink" opacity=".55"/><rect x="5" y="5" width="6" height="6" rx="1.6" fill="{ORANGE}" transform="rotate(-20 8 8)"/>'),
     6: ('Bold pebble',
         f'<path d="M26 4c10 0 16 11 16 21 0 14-8 19-17 19S7 39 7 26C7 15 15 4 26 4z" class="ink"/><rect x="12" y="29" width="24" height="5" rx="2.5" fill="{ORANGE}"/>',
         f'<path d="M8.6 1.5c3.4 0 5.6 3.6 5.6 7 0 4.6-2.8 6.3-5.8 6.3S2 13 2 8.6C2 5 4.8 1.5 8.6 1.5z" class="ink"/><rect x="4" y="9.5" width="8" height="2" rx="1" fill="{ORANGE}"/>'),
     7: ('Crystal',
         crystal,
         f'<path d="M8 1.5L13.5 6 11 14.5H5L2.5 6Z" class="ink"/><path d="M11 14.5H5L8 7.5Z" fill="{ORANGE}"/><path d="M8 1.5L8 7.5M13.5 6L8 7.5M2.5 6L8 7.5" stroke="{GROUND}" stroke-width=".8"/>'),
     8: ('Pixel grid',
         pix,
         f'<rect x="1.5" y="1.5" width="6" height="6" rx="1.4" fill="{ORANGE}"/><rect x="9" y="2" width="5" height="5" rx="1.1" class="ink"/><rect x="2" y="9" width="5" height="5" rx="1.1" class="ink"/><rect x="9.5" y="9.5" width="4" height="4" rx=".9" class="ink"/>'),
     9: ('Ribbon twist',
         f'<path d="M42 11c-12 0-18 10-24 18s-8 8-12 8v-8c4 0 6-2 12-10S30 3 42 3z" fill="{ORANGE}"/><path d="M6 11c12 0 18 10 24 18s8 8 12 8v-8c-4 0-6-2-12-10S18 3 6 3z" class="ink"/><path d="M19 22c2-2 4-5 6-8" stroke="{GROUND}" stroke-opacity=".55" stroke-width="2" stroke-linecap="round"/>',
         f'<path d="M14 4c-4 0-5 3-7 5.5S4 13 2 13v-2.5c1.5 0 2.2-.8 4-3.4S9.5 1.5 14 1.5z" fill="{ORANGE}"/><path d="M2 4c4 0 5 3 7 5.5s3 3.5 5 3.5v-2.5c-1.5 0-2.2-.8-4-3.4S6.5 1.5 2 1.5z" class="ink"/>'),
     10: ('Emblem',
         scallop(24, 24, 16.5, 12, 4.6) + f'<circle cx="24" cy="24" r="17" class="ink"/><circle cx="24" cy="24" r="12.5" fill="none" stroke="{GROUND}" stroke-width="1.6"/><circle cx="24" cy="24" r="4.5" fill="{ORANGE}"/>',
         scallop(8, 8, 5.3, 8, 1.7) + f'<circle cx="8" cy="8" r="5.5" class="ink"/><circle cx="8" cy="8" r="2" fill="{ORANGE}"/>'),
    }

    # ---- 11–20: the idioms of mainstream AI marks, each done in Shotviva's two colours ----
    import math as m
    def rays(cx, cy, n, lens, w, seed_rot, gap):
        out = ''
        for i, L in enumerate(lens):
            a = seed_rot + 360 * i / n
            out += f'<rect x="{cx - w/2}" y="{cy - L}" width="{w}" height="{L - gap}" rx="{w/2}" class="ink" transform="rotate({a} {cx} {cy})"/>'
        return out
    burst = rays(24, 24, 12, [20, 14, 18, 12, 21, 13, 17, 15, 20, 12, 18, 14], 4.2, 7, 6.5)
    burst_s = rays(8, 8, 8, [7.4, 5.4, 7.2, 5.2, 7.6, 5.6, 7, 5.4], 2, 10, 2.6)
    pix = ''
    for c in range(5):                       # five columns rising left to right; the bottom two blocks of each column are orange
        h = 1 + c
        for r in range(h):
            x = 6 + c * 7.6; y = 41 - 6.4 - r * 7.6
            pix += f'<rect x="{x}" y="{y}" width="6.4" height="6.4" rx="1.6" fill="{ORANGE}"/>' if r < 2 else f'<rect x="{x}" y="{y}" width="6.4" height="6.4" rx="1.6" class="ink" opacity="{1 - (r - 2) * .22:.2f}"/>'
    TEN.update({
     11: ('Knot', f'<path d="M24 7 L40 36 H8 Z" fill="none" class="inks" stroke-width="6" stroke-linejoin="round"/><path d="M24 7 L40 36" fill="none" stroke="{GROUND}" stroke-width="10"/><path d="M24 7 L40 36" fill="none" stroke="{ORANGE}" stroke-width="6" stroke-linecap="round"/><path d="M8 36 H40" fill="none" stroke="{GROUND}" stroke-width="10" stroke-dasharray="12 100" stroke-dashoffset="-2"/><path d="M8 36 H40" fill="none" class="inks" stroke-width="6" stroke-linecap="round"/><path d="M24 7 L8 36" fill="none" stroke="{GROUND}" stroke-width="10" stroke-dasharray="12 100" stroke-dashoffset="-22"/><path d="M24 7 L8 36" fill="none" class="inks" stroke-width="6" stroke-linecap="round"/>',
          f'<path d="M8 2.2L13.8 12.6H2.2Z" fill="none" class="inks" stroke-width="2.4" stroke-linejoin="round"/><path d="M8 2.2L13.8 12.6" stroke="{ORANGE}" stroke-width="2.4" stroke-linecap="round"/>'),
     12: ('Burst', burst + f'<circle cx="24" cy="24" r="4.4" fill="{ORANGE}"/>',
          burst_s + f'<circle cx="8" cy="8" r="2" fill="{ORANGE}"/>'),
     13: ('Sparkle', f'<path d="M24 4C25 16 30 21 44 24 30 27 25 32 24 44 23 32 18 27 4 24 18 21 23 16 24 4Z" class="ink"/><path d="M37 5c.5 4 2.5 6 6 7-3.5 1-5.5 3-6 7-.5-4-2.5-6-6-7 3.5-1 5.5-3 6-7z" fill="{ORANGE}"/>',
          f'<path d="M7.5 1.5c.4 4 2 5.6 6 6-4 .4-5.6 2-6 6-.4-4-2-5.6-6-6 4-.4 5.6-2 6-6z" class="ink"/><circle cx="13" cy="3" r="1.8" fill="{ORANGE}"/>'),
     14: ('Isometric', f'<path d="M24 6L41 15.5V33L24 42.5 7 33V15.5Z" class="ink" opacity=".35"/><path d="M24 6L41 15.5 24 25 7 15.5Z" class="ink"/><path d="M7 15.5L24 25V42.5L7 33Z" class="ink" opacity=".6"/><path d="M41 15.5L24 25V42.5L41 33Z" fill="{ORANGE}"/>',
          f'<path d="M8 1.5L14 4.8V11.2L8 14.5 2 11.2V4.8Z" class="ink" opacity=".6"/><path d="M8 1.5L14 4.8 8 8 2 4.8Z" class="ink"/><path d="M14 4.8L8 8V14.5L14 11.2Z" fill="{ORANGE}"/>'),
     15: ('Cut ring', f'<circle cx="24" cy="24" r="16" fill="none" class="inks" stroke-width="7"/><path d="M11 37L37 11" stroke="{GROUND}" stroke-width="12"/><path d="M11 37L37 11" stroke="{ORANGE}" stroke-width="6" stroke-linecap="round"/>',
          f'<circle cx="8" cy="8" r="5.6" fill="none" class="inks" stroke-width="2.4"/><path d="M3.5 12.5L12.5 3.5" stroke="{GROUND}" stroke-width="4.2"/><path d="M3.5 12.5L12.5 3.5" stroke="{ORANGE}" stroke-width="2.3" stroke-linecap="round"/>'),
     16: ('Ribbon', f'<defs><linearGradient id="rib" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F2ECE3"/><stop offset=".55" stop-color="#FFB08F"/><stop offset="1" stop-color="{ORANGE}"/></linearGradient></defs><path d="M10 30c0-12 8-20 18-20 8 0 12 5 12 11s-5 10-11 10c-5 0-8-3-8-7s3-6 6-6" fill="none" stroke="url(#rib)" stroke-width="7" stroke-linecap="round"/>',
          f'<path d="M3 10.5c0-4.5 2.8-7.5 6.5-7.5 3 0 4.5 1.8 4.5 4s-1.9 3.8-4.2 3.8c-1.8 0-2.8-1.1-2.8-2.5" fill="none" class="inks" stroke-width="2.4" stroke-linecap="round"/><circle cx="7.2" cy="8.3" r="1.6" fill="{ORANGE}"/>'),
     17: ('Pixel rise', pix,
          f'<rect x="1.5" y="10.5" width="3.6" height="3.6" rx=".9" fill="{ORANGE}"/><rect x="6.2" y="10.5" width="3.6" height="3.6" rx=".9" fill="{ORANGE}"/><rect x="6.2" y="6" width="3.6" height="3.6" rx=".9" class="ink"/><rect x="10.9" y="10.5" width="3.6" height="3.6" rx=".9" fill="{ORANGE}"/><rect x="10.9" y="6" width="3.6" height="3.6" rx=".9" class="ink"/><rect x="10.9" y="1.5" width="3.6" height="3.6" rx=".9" class="ink" opacity=".6"/>'),
     18: ('Iris', ''.join(f'<path d="M24 24C24 12 30 6 38 6 36 16 30 22 24 24Z" class="ink" opacity="{o}" transform="rotate({a} 24 24)"/>' for a, o in zip(range(0, 360, 72), (1, .8, .62, .8, 1))) + f'<circle cx="24" cy="24" r="4" fill="{ORANGE}"/>',
          ''.join(f'<path d="M8 8C8 3.8 10 1.8 13 1.8 12.3 5.3 10.2 7.3 8 8Z" class="ink" transform="rotate({a} 8 8)"/>' for a in range(0, 360, 72)) + f'<circle cx="8" cy="8" r="1.7" fill="{ORANGE}"/>'),
     19: ('Flame', f'<path d="M24 5c2 8 10 11 10 22 0 7-4.5 14-10 14S14 34 14 27c0-5 2-8 4-10 0 4 2 6 4 6 1-6-1-12 2-18z" class="ink"/><path d="M24 25c1.5 3 5 5 5 9 0 3-2.2 5-5 5s-5-2-5-5c0-4 3.5-6 5-9z" fill="{ORANGE}"/>',
          f'<path d="M8 1.5c.8 3 3.6 4 3.6 8 0 2.6-1.6 5-3.6 5S4.4 12.1 4.4 9.5c0-1.8.7-2.9 1.5-3.6 0 1.4.7 2.1 1.4 2.1.4-2.2-.4-4.3.7-6.5z" class="ink"/><circle cx="8" cy="11.6" r="1.8" fill="{ORANGE}"/>'),
     20: ('Bauhaus', f'<rect x="7" y="7" width="20" height="20" rx="3" class="ink"/><circle cx="34" cy="34" r="9" class="ink" opacity=".7"/><path d="M30 6L44 6 37 20Z" fill="{ORANGE}"/>',
          f'<rect x="1.5" y="1.5" width="7" height="7" rx="1.2" class="ink"/><circle cx="11.2" cy="11.2" r="3.3" class="ink" opacity=".75"/><path d="M9.5 1.5h5l-2.5 5z" fill="{ORANGE}"/>'),
    })

    # ---- 21–30: characters from the darkroom and from "a new look". Bold flat silhouettes, one orange. ----
    TEN.update({
     21: ('Moth', f'<path d="M23 23C12 9 2 16 6 29c3 8 12 8 17 0z" class="ink"/><path d="M25 23c11-14 21-7 17 6-3 8-12 8-17 0z" class="ink"/><rect x="21.6" y="15" width="4.8" height="24" rx="2.4" class="ink"/><path d="M22 15c-2-3-5-4-8-4M26 15c2-3 5-4 8-4" fill="none" class="inks" stroke-width="1.6" stroke-linecap="round"/><circle cx="24" cy="6" r="3.2" fill="{ORANGE}"/>',
          f'<path d="M7.5 7.5C4 3 .5 5.5 2 9.5c1 2.5 4 2.5 5.5 0z" class="ink"/><path d="M8.5 7.5c3.5-4.5 7-2 5.5 2-1 2.5-4 2.5-5.5 0z" class="ink"/><rect x="7.1" y="5" width="1.8" height="8.5" rx=".9" class="ink"/><circle cx="8" cy="2.2" r="1.5" fill="{ORANGE}"/>'),
     22: ('Clothespin', f'<path d="M20 6h3v24l-5 12h-3l2-12V9a3 3 0 0 1 3-3z" class="ink" transform="rotate(-7 24 20)"/><path d="M28 6h-3v24l5 12h3l-2-12V9a3 3 0 0 0-3-3z" class="ink" transform="rotate(7 24 20)"/><circle cx="24" cy="19" r="4.6" fill="{ORANGE}"/>',
          f'<path d="M6.5 1.5h1.6v8L6.4 14.5H4.8l1-5V3a1.5 1.5 0 0 1 .7-1.5z" class="ink" transform="rotate(-8 8 7)"/><path d="M9.5 1.5H7.9v8l1.7 5h1.6l-1-5V3a1.5 1.5 0 0 0-.7-1.5z" class="ink" transform="rotate(8 8 7)"/><circle cx="8" cy="6.6" r="2" fill="{ORANGE}"/>'),
     23: ('Hand mirror', f'<circle cx="24" cy="19" r="14" fill="none" class="inks" stroke-width="5"/><path d="M24 33v11" fill="none" class="inks" stroke-width="5" stroke-linecap="round"/><circle cx="19" cy="14" r="3.4" fill="{ORANGE}"/>',
          f'<circle cx="8" cy="6.5" r="4.6" fill="none" class="inks" stroke-width="2"/><path d="M8 11.5v3" fill="none" class="inks" stroke-width="2" stroke-linecap="round"/><circle cx="6.5" cy="5" r="1.4" fill="{ORANGE}"/>'),
     24: ('Spotlight', f'<path d="M15 19L44 35H26Z" fill="{ORANGE}" opacity=".92"/><circle cx="13" cy="14" r="7" class="ink"/><path d="M13 21v12M8 33h10" fill="none" class="inks" stroke-width="3" stroke-linecap="round"/>',
          f'<path d="M5 6l9.5 5.5H8z" fill="{ORANGE}"/><circle cx="4.5" cy="4.5" r="2.6" class="ink"/><path d="M4.5 7v4.5M2.5 11.5h4" fill="none" class="inks" stroke-width="1.6" stroke-linecap="round"/>'),
     25: ('Doorway', f'<path d="M11 44V22a13 13 0 0 1 26 0v22" fill="none" class="inks" stroke-width="6"/><path d="M18 44V24a6 6 0 0 1 12 0v20z" fill="{ORANGE}"/>',
          f'<path d="M3.5 14.5V7.2a4.5 4.5 0 0 1 9 0v7.3" fill="none" class="inks" stroke-width="2.2"/><path d="M6 14.5V8a2 2 0 0 1 4 0v6.5z" fill="{ORANGE}"/>'),
     26: ('Bottled light', f'<rect x="12" y="13" width="24" height="30" rx="6" class="ink"/><rect x="15" y="6" width="18" height="6" rx="2" class="ink"/><circle cx="24" cy="29" r="6.5" fill="{ORANGE}"/><circle cx="17" cy="21" r="1.4" fill="{ORANGE}"/><circle cx="31" cy="37" r="1.4" fill="{ORANGE}"/><circle cx="31.5" cy="20" r="1" fill="{ORANGE}"/>',
          f'<rect x="3.5" y="4.5" width="9" height="10" rx="2.2" class="ink"/><rect x="4.5" y="1.8" width="7" height="2" rx=".7" class="ink"/><circle cx="8" cy="9.8" r="2.3" fill="{ORANGE}"/><circle cx="5.5" cy="7" r=".6" fill="{ORANGE}"/>'),
     27: ('Match', f'<rect x="21.5" y="18" width="5" height="26" rx="2.5" class="ink" transform="rotate(12 24 31)"/><path d="M24 4c3 3 5 6 5 9a5 5 0 0 1-10 0c0-3 2-6 5-9z" fill="{ORANGE}"/><rect x="20" y="12" width="8" height="8" rx="4" class="ink" opacity=".55"/>',
          f'<rect x="7.1" y="6" width="1.8" height="8.5" rx=".9" class="ink" transform="rotate(10 8 10)"/><path d="M8 1.2c1.2 1.3 2 2.5 2 3.8a2 2 0 0 1-4 0c0-1.3.8-2.5 2-3.8z" fill="{ORANGE}"/>'),
     28: ('Plumb line', f'<path d="M24 4v24" fill="none" class="inks" stroke-width="2.2" stroke-linecap="round"/><path d="M24 26l7 7-7 11-7-11z" fill="{ORANGE}"/><circle cx="24" cy="4" r="2.4" class="ink"/>',
          f'<path d="M8 1.5v7" fill="none" class="inks" stroke-width="1.6" stroke-linecap="round"/><path d="M8 7.5l3 3.2L8 14.8 5 10.7z" fill="{ORANGE}"/>'),
     29: ('Darkroom cat', f'<path d="M8 18L12 6l9 6h6l9-6 4 12c2 6 2 10 0 14-3 6-9 10-16 10S11 36 8 32c-2-4-2-8 0-14z" class="ink"/><path d="M19 23c0 4 1 6 2 6s2-2 2-6-1-3-2-3-2-1-2 3z" fill="{ORANGE}"/><path d="M25 23c0 4 1 6 2 6s2-2 2-6-1-3-2-3-2-1-2 3z" fill="{ORANGE}"/>',
          f'<path d="M2.8 6L4 2l3 2h2l3-2 1.2 4c.6 2 .6 3.3 0 4.6C12.2 12.6 10.3 14 8 14s-4.2-1.4-5.2-3.4C2.2 9.3 2.2 8 2.8 6z" class="ink"/><circle cx="6.3" cy="8" r="1.1" fill="{ORANGE}"/><circle cx="9.7" cy="8" r="1.1" fill="{ORANGE}"/>'),
     30: ('Pull-chain lamp', f'<path d="M24 4v6" fill="none" class="inks" stroke-width="2.2" stroke-linecap="round"/><path d="M7 26A17 17 0 0 1 41 26Z" class="ink"/><circle cx="24" cy="31" r="5.5" fill="{ORANGE}"/><path d="M34 27v9" fill="none" class="inks" stroke-width="1.8" stroke-linecap="round" stroke-dasharray="2 2"/><circle cx="34" cy="38" r="1.8" class="ink"/>',
          f'<path d="M8 1v2" fill="none" class="inks" stroke-width="1.6" stroke-linecap="round"/><path d="M2 9.5A6 6 0 0 1 14 9.5Z" class="ink"/><circle cx="8" cy="11.3" r="2.1" fill="{ORANGE}"/><path d="M12.3 10v3" fill="none" class="inks" stroke-width="1.2" stroke-linecap="round"/>'),
    })

    # ---- 31–40: what Manus and Lovart share: a character or a gesture with a face's worth of personality, hand-drawn monoline, a joke. All about taking a photo. ----
    S = 'fill="none" class="inks" stroke-width="3.3" stroke-linecap="round" stroke-linejoin="round"'
    s2 = 'fill="none" class="inks" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
    O = f'fill="none" stroke="{ORANGE}" stroke-width="3.3" stroke-linecap="round" stroke-linejoin="round"'
    o2 = f'fill="none" stroke="{ORANGE}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
    TEN.update({
     31: ('V pose', f'<path d="M14 30c-2 8 2 14 10 14s12-6 10-14c-1-4-6-5-9-3-3-2-9-1-11 3z" {S}/><path d="M19 27L10 8c-1-2 2-4 3-2l10 18M29 27l9-19c1-2-2-4-3-2L25 24" {S}/><circle cx="24" cy="5" r="2.6" fill="{ORANGE}"/>',
          f'<path d="M4.5 10c-.6 2.6.8 4.5 3.5 4.5s4.1-1.9 3.5-4.5c-.4-1.3-2-1.6-3-1-1-.6-2.6-.3-4 1z" {s2}/><path d="M6.5 9L3.5 2.6M9.5 9l3-6.4" {s2}/><circle cx="8" cy="1.8" r="1.2" fill="{ORANGE}"/>'),
     32: ('Finger frame', f'<path d="M8 20V8h12M40 28v12H28" {S}/><path d="M8 20c0 4 2 6 5 6M40 28c0-4-2-6-5-6" {S}/><circle cx="24" cy="24" r="3.4" fill="{ORANGE}"/>',
          f'<path d="M2.5 7V2.5H7M13.5 9v4.5H9" {s2}/><circle cx="8" cy="8" r="1.6" fill="{ORANGE}"/>'),
     33: ('The squint', f'<circle cx="24" cy="24" r="18" {S}/><circle cx="17" cy="21" r="2.6" class="ink"/><path d="M27 21h6" {S}/><path d="M18 31c3 3 9 3 12 0" {S}/><circle cx="36" cy="10" r="2.6" fill="{ORANGE}"/>',
          f'<circle cx="8" cy="8" r="6" {s2}/><circle cx="5.8" cy="7" r="1" class="ink"/><path d="M9 7h2.4" {s2}/><path d="M5.8 10.2c1.3 1.1 3.1 1.1 4.4 0" {s2}/><circle cx="12.6" cy="3.2" r="1.3" fill="{ORANGE}"/>'),
     34: ('Say cheese', f'<path d="M8 20c2-3 5-3 7 0M33 20c2-3 5-3 7 0" {S}/><path d="M9 29c4 9 26 9 30 0" {S}/><path d="M13 33c5 3 17 3 22 0" fill="none" stroke="{ORANGE}" stroke-width="3.3" stroke-linecap="round"/>',
          f'<path d="M3 6.5c.8-1 2-1 2.8 0M10.2 6.5c.8-1 2-1 2.8 0" {s2}/><path d="M3 9.5c1.5 3.5 8.5 3.5 10 0" {s2}/><path d="M4.8 11.3c1.8 1.1 4.6 1.1 6.4 0" {o2}/>'),
     35: ('You blinked', f'<path d="M8 20c3 4 8 4 11 0M29 20c3 4 8 4 11 0" {S}/><circle cx="24" cy="33" r="3.2" {O}/><path d="M12 10l-2-4M36 10l2-4" {S}/>',
          f'<path d="M2.5 6.5c1 1.4 2.8 1.4 3.8 0M9.7 6.5c1 1.4 2.8 1.4 3.8 0" {s2}/><circle cx="8" cy="11.3" r="1.3" {o2}/>'),
     36: ('Pinched print', f'<path d="M14 44c-5-5-6-12-4-20l3-10c1-2 4-1 3 1l-1 7" {S}/><path d="M15 22l9-6c2-1 3 2 1 3l-7 5" {S}/><path d="M14 44h10c5 0 8-4 8-9v-3" {S}/><rect x="24" y="4" width="16" height="20" rx="2" fill="{ORANGE}"/><rect x="28" y="8" width="8" height="10" rx="1" fill="{GROUND}" opacity=".35"/>',
          f'<path d="M4.5 14.5c-1.8-1.8-2-4.4-1.3-7l1-3.3c.4-.7 1.3-.4 1.1.4l-.3 2.2" {s2}/><path d="M5 7.8l3-2M4.5 14.5h3.3c1.7 0 2.7-1.3 2.7-3" {s2}/><rect x="8" y="1.5" width="6" height="7.5" rx=".8" fill="{ORANGE}"/>'),
     37: ("Chef's kiss", f'<path d="M14 44c-4-4-5-11-3-18l2-7c1-2 4-1 3 1l-1 6" {S}/><path d="M15 26l10-12c2-2 5 0 3 3l-5 6" {S}/><path d="M14 44h9c6 0 9-4 9-10v-4" {S}/><path d="M34 16c3-1 5-1 7 1M34 10c2-2 5-3 8-2M37 20c3 0 5 1 6 3" {O}/>',
          f'<path d="M4.5 14.5c-1.5-1.5-1.8-4-1-6.5l.7-2.5c.4-.8 1.4-.4 1.1.4l-.3 2.3" {s2}/><path d="M5 9.5l3.5-4.2c.7-.8 1.8 0 1.1 1L8 8.5" {s2}/><path d="M4.5 14.5h3c2.2 0 3.4-1.4 3.4-3.6v-1.4" {s2}/><path d="M11.5 5.6c1-.4 1.8-.3 2.5.3M11.5 3.4c.8-.7 1.8-1 2.8-.8" {o2}/>'),
     38: ('OK', f'<path d="M12 44c-4-5-5-12-2-20l3-8" {S}/><path d="M13 16c-1-3 1-6 4-6s5 3 4 6l-2 6c-1 2 1 4 3 3l9-5c2-1 4 1 2 3M12 44h9c6 0 10-4 10-10l1-9" {S}/><path d="M28 10l3-6M33 13l5-4M35 19l6-1" {O}/>',
          f'<path d="M4 14.5c-1.3-1.7-1.6-4-.7-6.6l1-2.6" {s2}/><path d="M4.4 5.3c-.3-1 .3-2 1.3-2s1.7 1 1.4 2l-.7 2c-.3.7.4 1.3 1 1l3-1.7c.7-.3 1.3.3.7 1M4 14.5h3c2 0 3.3-1.3 3.3-3.3l.3-3" {s2}/><path d="M9.3 3.3l1-2M11 4.4l1.7-1.3" {o2}/>'),
     39: ('Viva!', f'<path d="M20 44c-5-4-7-10-6-18l1-7c0-2 3-2 3 0l1 5 2-14c0-2 3-2 3 0v13l3-12c0-2 3-2 3 0l-1 13 4-8c1-2 3-1 3 1l-3 14c0 7-5 12-11 12z" {S}/><path d="M7 14l-3-3M9 8L8 4M38 14l3-3M36 8l1-4" {O}/>',
          f'<path d="M6.5 14.5c-1.7-1.4-2.3-3.4-2-6l.4-2.3c0-.7 1-.7 1 0l.3 1.7.7-4.7c0-.7 1-.7 1 0v4.3l1-4c0-.7 1-.7 1 0l-.3 4.3 1.3-2.7c.3-.7 1-.3 1 .3l-1 4.7c0 2.4-1.7 4-3.7 4z" {s2}/><path d="M2 4.5l-1-1M13.5 4.5l1-1" {o2}/>'),
     40: ('Close look', f'<path d="M6 24c5-8 11-12 18-12s13 4 18 12c-5 8-11 12-18 12S11 32 6 24z" {S}/><circle cx="24" cy="24" r="6" {S}/><circle cx="24" cy="24" r="2.6" fill="{ORANGE}"/><path d="M40 10l3-3M8 10L5 7" {O}/>',
          f'<path d="M1.8 8c1.7-2.8 3.8-4.2 6.2-4.2S12.5 5.2 14.2 8c-1.7 2.8-3.8 4.2-6.2 4.2S3.5 10.8 1.8 8z" {s2}/><circle cx="8" cy="8" r="2" {s2}/><circle cx="8" cy="8" r=".9" fill="{ORANGE}"/>'),
    })

    # ---- 41–46: the Netflix way: the initial as one bold ribbon, folds shown by shade. Orange ribbon on the dark ground. ----
    DK = '#B83E1C'   # the ribbon's back / fold shade
    LT = '#FF8A5C'   # a lit edge
    SPATH = 'M34.5 13.5C32 9 27.5 7.5 23 7.5c-7 0-12 4-12 9.5 0 6 5 8 12 9.5s12 3.5 12 9.5c0 6-5.5 9.5-12.5 9.5-5.5 0-10-2-12.5-6.5'
    defs = f'<defs><linearGradient id="fold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{ORANGE}"/><stop offset=".5" stop-color="{DK}"/><stop offset="1" stop-color="{ORANGE}"/></linearGradient><linearGradient id="foldv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{DK}"/><stop offset=".55" stop-color="{ORANGE}"/></linearGradient></defs>'
    TEN.update({
     41: ('Folded S', defs + f'<path d="M10 8h28v9H10z" fill="{ORANGE}"/><path d="M10 31h28v9H10z" fill="{ORANGE}"/><path d="M10 8l9 0 19 23v9h-9L10 17z" fill="url(#fold)"/><path d="M10 8h9l5 6-14 3z" fill="{DK}" opacity=".55"/><path d="M38 40h-9l-5-6 14-3z" fill="{DK}" opacity=".55"/>',
          f'<path d="M2.5 2.5h11v3h-11zM2.5 10.5h11v3h-11z" fill="{ORANGE}"/><path d="M2.5 2.5h3.6l7.4 8.6v2.4h-3.6L2.5 5z" fill="{DK}"/>'),
     42: ('Ribbon S', f'<path d="{SPATH}" fill="none" stroke="{ORANGE}" stroke-width="8.5" stroke-linecap="butt"/><path d="M11 17c0 6 5 8 12 9.5" fill="none" stroke="{DK}" stroke-width="8.5"/><path d="M23 26.5c7 1.5 12 3.5 12 9.5" fill="none" stroke="{DK}" stroke-width="8.5"/><path d="M11 17c0 6 5 8 12 9.5s12 3.5 12 9.5" fill="none" stroke="{ORANGE}" stroke-width="8.5" stroke-dasharray="6 40" stroke-dashoffset="-14" opacity="0"/>',
          f'<path d="M11.5 4.5C10.6 3 9.1 2.5 7.6 2.5 5.3 2.5 3.6 3.8 3.6 5.6c0 2 1.7 2.7 4 3.2s4 1.2 4 3.2c0 2-1.8 3.2-4.2 3.2-1.8 0-3.3-.7-4.1-2.2" fill="none" stroke="{ORANGE}" stroke-width="2.8"/><path d="M3.6 5.6c0 2 1.7 2.7 4 3.2" fill="none" stroke="{DK}" stroke-width="2.8"/>'),
     43: ('Cut S', f'<path d="{SPATH}" fill="none" stroke="{ORANGE}" stroke-width="9" stroke-linecap="round"/><path d="M6 30L42 14" stroke="{GROUND}" stroke-width="4" opacity=".9"/><path d="M6 30L42 14" stroke="{DK}" stroke-width="4" transform="translate(0 3.5)" opacity=".6"/>',
          f'<path d="M11.5 4.5C10.6 3 9.1 2.5 7.6 2.5 5.3 2.5 3.6 3.8 3.6 5.6c0 2 1.7 2.7 4 3.2s4 1.2 4 3.2c0 2-1.8 3.2-4.2 3.2-1.8 0-3.3-.7-4.1-2.2" fill="none" stroke="{ORANGE}" stroke-width="2.9" stroke-linecap="round"/><path d="M2 10L14 5" stroke="{GROUND}" stroke-width="1.4"/>'),
     44: ('Bone ribbon', f'<path d="{SPATH}" fill="none" stroke="{INK_DARK}" stroke-width="8.5"/><path d="M11 17c0 6 5 8 12 9.5" fill="none" stroke="{ORANGE}" stroke-width="8.5"/><path d="M23 26.5c7 1.5 12 3.5 12 9.5" fill="none" stroke="{ORANGE}" stroke-width="8.5"/>',
          f'<path d="M11.5 4.5C10.6 3 9.1 2.5 7.6 2.5 5.3 2.5 3.6 3.8 3.6 5.6c0 2 1.7 2.7 4 3.2s4 1.2 4 3.2c0 2-1.8 3.2-4.2 3.2-1.8 0-3.3-.7-4.1-2.2" fill="none" class="inks" stroke-width="2.8"/><path d="M3.6 5.6c0 2 1.7 2.7 4 3.2" fill="none" stroke="{ORANGE}" stroke-width="2.8"/>'),
     45: ('Extruded S', f'<path d="{SPATH}" fill="none" stroke="{DK}" stroke-width="9" stroke-linecap="round" transform="translate(2.5 3)"/><path d="{SPATH}" fill="none" stroke="{ORANGE}" stroke-width="9" stroke-linecap="round"/><path d="{SPATH}" fill="none" stroke="{LT}" stroke-width="1.6" stroke-linecap="round" transform="translate(-1.2 -1.6)" opacity=".7"/>',
          f'<path d="M11.5 4.5C10.6 3 9.1 2.5 7.6 2.5 5.3 2.5 3.6 3.8 3.6 5.6c0 2 1.7 2.7 4 3.2s4 1.2 4 3.2c0 2-1.8 3.2-4.2 3.2-1.8 0-3.3-.7-4.1-2.2" fill="none" stroke="{DK}" stroke-width="2.8" stroke-linecap="round" transform="translate(.9 1)"/><path d="M11.5 4.5C10.6 3 9.1 2.5 7.6 2.5 5.3 2.5 3.6 3.8 3.6 5.6c0 2 1.7 2.7 4 3.2s4 1.2 4 3.2c0 2-1.8 3.2-4.2 3.2-1.8 0-3.3-.7-4.1-2.2" fill="none" stroke="{ORANGE}" stroke-width="2.8" stroke-linecap="round"/>'),
     46: ('Slab S', f'<path d="M36 10H18c-5 0-8 3-8 7s3 6 8 6h12c5 0 8 3 8 7s-3 8-8 8H12" fill="none" stroke="{ORANGE}" stroke-width="9" stroke-linejoin="round" stroke-linecap="butt"/><path d="M18 23h12" stroke="url(#foldv)" stroke-width="9"/>',
          f'<path d="M12.5 3.5h-6c-1.7 0-2.7 1-2.7 2.3s1 2.2 2.7 2.2h3.5c1.7 0 2.7 1 2.7 2.3s-1 2.7-2.7 2.7H3.5" fill="none" stroke="{ORANGE}" stroke-width="2.9" stroke-linejoin="round"/><path d="M6.5 8h3.5" stroke="{DK}" stroke-width="2.9"/>'),
    })
    return TEN

def cards(TEN):
    out = ''
    for n, (name, big, small) in TEN.items():
        fav = lambda sz: f'<svg class="m" viewBox="0 0 16 16" width="{sz}" height="{sz}" aria-hidden="true">{small}</svg>'
        out += ('<article class="tcard">'
                f'<div class="tbig"><svg viewBox="0 0 48 48" width="168" height="168" aria-hidden="true">{big}</svg></div>'
                f'<div class="tfav"><span class="chip light">{fav(16)}{fav(32)}</span><span class="chip dark">{fav(16)}{fav(32)}</span></div>'
                f'<h3><span>{n}</span>{name}</h3></article>')
    return f'<section class="ten"><h2 class="ten-h">Ten styles</h2><div class="tgrid">{out}</div></section>'
