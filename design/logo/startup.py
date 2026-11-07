# iOS web-app startup images (T65): the darkroom ground edge to edge with the app icon's "S." (glow
# included, rounded plate and lip removed) centred, the icon box 40 % of the screen width.
# Writes export/startup/*.svg; render each to public/startup/startup-<W>x<H>.png at real pixels:
#   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --hide-scrollbars \
#     --force-device-scale-factor=1 --window-size=W,H --screenshot=OUT.png export/startup/startup-WxH.svg
# The sizes must match src/core/seo/startup-images.ts (its test checks every file exists).
import os
import re

GROUND = '#0B0A09'
# (device width, device height in CSS px, pixel ratio): portrait screens of the iPhones in use.
SCREENS = [
    (440, 956, 3), (430, 932, 3), (420, 912, 3), (402, 874, 3), (393, 852, 3), (390, 844, 3),
    (428, 926, 3), (414, 896, 3), (414, 896, 2), (375, 812, 3), (375, 667, 2),
]

icon = open('c-s-dot-icon-1024.svg').read()
inner = re.search(r'<svg[^>]*>(.*)</svg>', icon, re.S).group(1)
inner = re.sub(r'<rect width="1024" height="1024" rx="224"[^>]*/>', '', inner)
os.makedirs('export/startup', exist_ok=True)
for w, h, r in SCREENS:
    W, H = w * r, h * r
    box = round(W * 0.40)
    x, y = (W - box) / 2, (H - box) / 2
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
           f'<rect width="{W}" height="{H}" fill="{GROUND}"/>'
           f'<svg x="{x:.1f}" y="{y:.1f}" width="{box}" height="{box}" viewBox="0 0 1024 1024">{inner}</svg></svg>')
    open(f'export/startup/startup-{W}x{H}.svg', 'w').write(svg)
    print(W, H)
