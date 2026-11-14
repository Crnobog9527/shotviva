---
name: Shotviva
description: AI photo studio. Template-based image to image in a "Darkroom" world; warm black, bone type, one safelight, and the user's photo developing into the result.
colors:
  background: "#0B0A09"
  foreground: "#F2ECE3"
  card: "#141210"
  popover: "#181513"
  primary: "#FF5B2E"
  primary-foreground: "#1A0702"
  secondary: "#211D1A"
  muted: "#1C1916"
  muted-foreground: "#A2988C"
  accent: "#2A2420"
  destructive: "#FF5A5A"
  success: "#7FD6A0"
  border: "rgba(242, 236, 227, 0.09)"
  input: "rgba(242, 236, 227, 0.16)"
  ring: "#FF5B2E"
  bone-dim: "rgba(242, 236, 227, 0.62)"
  hairline: "rgba(242, 236, 227, 0.06)"
  graphite: "#191715"
  sapphire-top: "#111A33"
  sapphire-deep: "#0B1020"
  sapphire-ink: "#A9C2FF"
  sapphire-rim: "#7EA0FF"
  sapphire-flag: "#5B86FF"
  max-black-top: "#1C160C"
  max-black-deep: "#0C0A07"
  max-gold: "#F2CF7A"
typography:
  large-title:
    fontFamily: "Instrument Serif, Times New Roman, serif"
    fontSize: "52px"
    fontWeight: 400
    lineHeight: 0.9
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Instrument Serif, Times New Roman, serif"
    fontSize: "36px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "-0.02em"
  h1:
    fontFamily: "Instrument Serif, Times New Roman, serif"
    fontSize: "32px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "-0.02em"
  price:
    fontFamily: "Instrument Serif, Times New Roman, serif"
    fontSize: "40px"
    fontWeight: 400
    lineHeight: 0.9
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Geist, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  item-title:
    fontFamily: "Geist, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Geist, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "-0.006em"
  button:
    fontFamily: "Geist, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.01em"
  button-primary:
    fontFamily: "Geist, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "16.5px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.01em"
  field-label:
    fontFamily: "Geist, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.3
  caption:
    fontFamily: "Geist, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.35
  measure:
    fontFamily: "Geist Mono, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0em"
rounded:
  tag: "8px"
  inner: "12px"
  button: "14px"
  control: "16px"
  tile: "18px"
  media: "20px"
  panel: "22px"
  sheet: "30px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  gutter: "16px"
  section: "72px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.button-primary}"
    rounded: "{rounded.tile}"
    height: "56px"
    width: "100%"
  button-primary-neutral:
    backgroundColor: "{colors.foreground}"
    textColor: "{colors.background}"
    typography: "{typography.button-primary}"
    rounded: "{rounded.tile}"
    height: "56px"
    width: "100%"
  button-ghost:
    backgroundColor: "rgba(242, 236, 227, 0.06)"
    textColor: "{colors.foreground}"
    typography: "{typography.button}"
    rounded: "{rounded.button}"
    padding: "0 18px"
    height: "44px"
  chip:
    backgroundColor: "rgba(242, 236, 227, 0.06)"
    textColor: "{colors.bone-dim}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "36px"
  chip-selected:
    backgroundColor: "{colors.foreground}"
    textColor: "{colors.background}"
    rounded: "{rounded.pill}"
  textarea:
    backgroundColor: "rgba(242, 236, 227, 0.04)"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "14px"
  panel:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.panel}"
  template-card-media:
    backgroundColor: "{colors.muted}"
    rounded: "{rounded.control}"
  sheet:
    backgroundColor: "{colors.popover}"
    rounded: "{rounded.sheet}"
  tab-bar:
    backgroundColor: "rgba(14, 12, 11, 0.78)"
    textColor: "{colors.muted-foreground}"
    height: "50px"
  tier-starter:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.panel}"
    padding: "14px 16px 13px"
  tier-pro:
    backgroundColor: "{colors.sapphire-deep}"
    textColor: "{colors.sapphire-ink}"
    rounded: "{rounded.panel}"
    padding: "14px 16px 13px"
  tier-max:
    backgroundColor: "{colors.max-black-deep}"
    textColor: "{colors.max-gold}"
    rounded: "{rounded.panel}"
    padding: "15px 17px 14px"
---

# Design System: Shotviva

## Overview

**Creative North Star: "The Darkroom"**

Shotviva is a darkroom for a phone photo. The room is warm black, never blue and never pure black; type is the colour of bone paper; and the one light in the room is the safelight, a hot red-orange that marks what to press, what the AI made, and what is developing right now. The user's photo is the print in the tray: the interface is dark and quiet so the image is the brightest, most colourful thing on screen. A single static film-grain layer sits over everything, the way a darkroom print carries grain; it never moves.

The language of the room runs through the product. Uploading is framed in a viewfinder with four corner brackets and a 4:5 readout; generating is "Developing", shown as a greyed negative turning positive under a safelight scan line; finished photos land in Photos. Display type is Instrument Serif, a narrow editorial serif with an italic used for one emphasised phrase per headline; everything you read or tap is Geist; and Geist Mono is kept for real measurements only (credits, px, ratios, percentages, per-credit prices). Edges are drawn as 1px inset hairlines in bone at 9%, not as borders or drop shadows.

The system behaves like a native iOS app on mobile web: a large serif title on tab roots, a bottom tab bar there, flow pages with a back link and one fixed bottom action, bottom sheets for every overlay, and press feedback (scale) on every tappable surface. The paywall is the one place colour widens: three tiers are told apart by material, matte graphite, sapphire glass, black and gold.

**Key Characteristics:**
- Warm black ground, bone type, one safelight accent; the photo carries all other colour.
- One static film-grain overlay at 7% opacity, never animated.
- Instrument Serif for display (sentence case, one italic phrase), Geist for UI, Geist Mono only for measurements.
- Edges are inset 1px hairlines; depth comes from tone steps and two drop levels.
- Every template card is a split at rest: phone photo left, AI result right.
- One filled full-width primary per screen, in the thumb zone.
- Paywall tiers are materials: graphite, sapphire glass, black and gold.

## Colors

Warm sepia-black neutrals in four tone steps, bone type at two strengths, and a single safelight; tier materials are the only other hues and live only on the paywall. Values are hex (and rgba for bone-alpha strokes) on `:root` under shadcn/ui variable names.

### Primary
- **Safelight** (#FF5B2E): the primary button fill, focus ring, the "AI" split tag, the current tab's icon, the step-line and scan line while a photo develops, progress fills, the period in the wordmark, the selected template ring and selected size/resolution rim. Text on it is **Fixer Black** (#1A0702, 6.31:1).

### Neutral
- **Darkroom Black** (#0B0A09): page ground, app bars (at 92–94% under blur), text on bone fills.
- **Tray** (#141210): grouped panels, tables, list rows, template-card meta zone, the facts block.
- **Sheet** (#181513): bottom sheets and the generator card's top stop.
- **Graphite** (#191715): selectable rows on the paywall (Starter tier, credit packs, payment methods). One step lighter than Sheet so a choice reads as a surface.
- **Muted** (#1C1916): image wells before an image loads (template media, compare).
- **Secondary** (#211D1A) / **Accent** (#2A2420): shadcn slots defined for the build; the comps do not use them yet.
- **Bone** (#F2ECE3): body text, titles, selected chip fill, the selected segment thumb, the neutral primary fill.
- **Bone Dim** (rgba 242,236,227 at 62%): secondary reading text (ledes, chip labels at rest, pills, cost tags, perk-adjacent copy).
- **Ash** (#A2988C): captions, metadata, section counts, table row heads, "(optional)".
- **Hairline** (rgba bone at 9%): the one edge, drawn as `inset 0 0 0 1px`. **Rule** (bone at 6%): row dividers inside tables and step lists. **Input** (bone at 16%): textarea edge at rest.
- **Success** (#7FD6A0): uploaded tick, completed stage ticks, on a 15–16% tint of itself.
- **Destructive** (#FF5A5A): errors only (none in the comps).

### Tier materials (paywall only)
- **Graphite** (#191715): Starter. Flat, hairline edge, bone check when chosen.
- **Sapphire glass** (#111A33 to #0B1020, with a blue light pooling in the top-right corner): Pro. Name in **Sapphire Ink** (#A9C2FF), "Recommended" flag in **Sapphire** (#5B86FF) with near-black ink, a 1px cool rim that becomes a 1.5px **Sapphire Rim** (#7EA0FF) when chosen.
- **Black and gold** (#1C160C to #0C0A07, a gold light in the top-right corner): Max. Name and price in solid **Max Gold** (#F2CF7A), a 1.5px gold-foil rim that slowly turns, gold check, gold-foil flag and gold-foil checkout button.

### Measured contrast (WCAG 2.1, text at 14px or larger)

| Text | Surface | Ratio |
|---|---|---|
| Ash | Darkroom Black / Tray / Sheet / paywall sheet | 6.98 / 6.59 / 6.41 / 6.70 |
| Ash | Graphite / chosen pack (#201D1A) / Secondary | 6.30 / 5.92 / 5.90 |
| Ash | chip or pill tint on black / pill tint on Tray | 6.26 / 5.64 |
| Ash | Pro glass, top to bottom (away from the corner light) | 6.07 to 6.68 |
| Ash | Max black, top to bottom (sheen at rest) | 6.33 to 6.97 |
| Ash at 85% (tab labels at rest) | tab bar material | 5.25 |
| Bone Dim | every neutral surface above | 6.09 to 6.73 |
| Perk text (#D8D0C4) | Pro / Max, worst point | 7.29 / 7.32 |
| Sapphire Ink / Max Gold | their tier, worst point | 6.28 / 7.45 |
| Fixer Black on Safelight | primary button, "AI" tag | 6.31 |
| Safelight as text | Darkroom Black / Tray | 6.39 / 6.04 |

Where the build falls short of this table (Coming soon perks dimmed to 80%, Max sheen behind text, the 70% placeholder) is listed as a defect, not as a value.

### Named Rules
**The One Safelight Rule.** Safelight is the only chromatic UI colour outside the paywall tiers. It marks the primary action, the AI side, the current place and live progress; it is never a background wash behind body text and never decoration.

**The 13px→14px Contrast Rule.** Captions are at least 14px, and Ash or Bone Dim text holds at least 4.5:1 on every surface it sits on, including every point of each paywall tier. Check the lightest point of a gradient or overlay, not its base. Never dim muted text further with opacity.

## Typography

**Display Font:** Instrument Serif (with Times New Roman, serif), regular and italic
**Body Font:** Geist (with -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif)
**Label/Mono Font:** Geist Mono (with ui-monospace, SF Mono, Menlo, monospace)

All three are OFL and self-hosted (`next/font`); weights in use: Geist 400 to 700, Geist Mono 400 to 500, Instrument Serif 400.

**Character:** A narrow, high-contrast editorial serif set tight against a precise grotesk. The serif is the darkroom's print label: large, quiet, regular weight only, with italic for the one phrase that matters ("Keep the Subject", "a full shoot").

### Hierarchy
- **Large title** (Instrument Serif 400, 52px, 0.9, -0.03em): tab-root page titles ("Create", "Photos").
- **Title** (Instrument Serif 400, 36px, 1, -0.02em): marketing section heads and the workspace template name.
- **H1** (Instrument Serif 400, 32px, 1, -0.02em): the homepage H1 display line and bottom-sheet titles; 32px is the mobile H1 size in 规范 §3.2.
- **Price** (Instrument Serif 400, 40px, 0.9, -0.02em): tier prices. Smaller serif numerals carry credit counts on packs and resolution cards.
- **Headline** (Geist 600, 17px, 1.25, -0.015em): sub-section heads ("Your photo", "Size", "Credit packs", step titles).
- **Item title** (Geist 600, 16px, 1.25): template names, FAQ questions, list-row titles, job names.
- **Body** (Geist 400, 16px, 1.5, -0.006em): ledes, answers, FAQ answers, field text.
- **Button** (Geist 600, 15px, 1, -0.01em); **primary button** 16.5px.
- **Field label** (Geist 500, 15px, 1.3), with "(optional)" at 400 in Ash.
- **Caption** (Geist 400 or 500, 14px, 1.35): metadata, uses, tags, chips, pills, notes, fine print. The floor for any visible text.
- **Measure** (Geist Mono 400 or 500, 14px, 1): credits on buttons and cards, px sizes, ratios, counters, percentages, per-credit prices.

### Named Rules
**The 16px Input Rule.** Every input and textarea renders its text at 16px or larger, so iOS never zooms the page. Placeholders sit in the same 16px.

**The Measurement Mono Rule.** Geist Mono appears only on real measurements: a cost, a size, a ratio, a count, a percentage. Words never go in mono.

**The One Italic Rule.** A serif headline may italicise one phrase. Display type is never bold and never all caps.

## Layout

A single 375px-first column with a 16px gutter. Tab roots open on a large serif title with a balance chip or count on the right, then content, then the fixed tab bar. Flow pages (workspace) open with a sticky nav row (back link left, title fading in on scroll, balance chip right), stack sections 26px apart, and end with a fixed bottom action bar holding at most one notice line and the primary. The marketing page is a long scroll: H1 and answer block, the generator card in the first viewport, then sections 72px apart, and a footer.

Horizontal scroll exists only in explicit rails (template rails at 156px cards with snap, the filter chips, the generator's template picks), with the next card peeking. Grids are two columns on phone (template grid 20px row gap, 12px column gap; Photos 14px / 10px). Size tiles run four across. Paywall packs run three across.

Fixed chrome respects safe areas through `env(safe-area-inset-*)`, full-height surfaces use `100dvh`. Desktop is not drawn in this build; it follows 规范 §8.6.

### Named Rules
**The One Primary Rule.** Each screen has exactly one filled, full-width primary, 56px tall, in the bottom thumb zone (or the generator card on the homepage). The homepage's floating dock repeats the generator's own primary and shows only while the generator is off-screen, so the two are never visible together. Every other action is ghost, quiet or a link.

## Elevation & Depth

Depth is tonal first: Darkroom Black, Tray, Sheet, Graphite step up in lightness, and every surface edge is an inset 1px bone hairline (sometimes with a 1px top highlight in white at 3.5–5%). Drop shadows exist at two levels only. Frosted material (blur 18–24px, saturate up to 1.4) is reserved for fixed chrome over scrolling content and for small labels sitting on photos. The film grain sits above everything at 7% opacity in overlay blend.

### Shadow Vocabulary
- **Hairline edge** (`box-shadow: inset 0 0 0 1px var(--border)`): every panel, tile, card, row, thumbnail. Chosen state thickens it to 1.5px in Safelight, Bone or the tier rim.
- **Raised** (`box-shadow: inset 0 1px 0 rgba(255,255,255,.38), inset 0 -2px 0 rgba(0,0,0,.12), 0 16px 30px -16px rgba(0,0,0,.9)`): the primary button. The generator card uses the same lifted drop (`0 30px 60px -30px rgba(0,0,0,.8)`).
- **Sheet** (`box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 -30px 60px -20px rgba(0,0,0,.7)`): bottom sheets.
- **Material bar** (`box-shadow: inset 0 1px 0 var(--border)` over a blurred translucent black): tab bar, action bar, checkout.

### Named Rules
**The Inset Hairline Rule.** Edges are inset 1px bone strokes, never CSS borders on cards and never coloured outlines at rest.

**The Static Grain Rule.** One film-grain layer over the whole page, fixed, non-interactive, never animated.

## Shapes

Soft rounded rectangles, nested so inner radii are smaller than outer: sheets 30px at the top corners, panels and tier cards 22px, image media and tables 20px, the primary button, template cards and homepage tiles 18px, textarea, packs, pay rows and card media 16px, standard buttons 14px (the `--radius` token), inner tiles and thumbnails 12px, on-photo tags 7–8px. Chips, pills, the balance chip, flags and small ghost buttons are full pills. Photos are 4:5 by default (template media, upload zone, results), 16:10 for the featured card, 1:1 for the hero result.

The viewfinder is the one recurring silhouette: four 22px corner brackets (1.5px bone strokes, 8px outer radius) inset 14px inside the upload zone.

## Components

Every component maps to shadcn/ui (new-york) or to one of the self-built components in 规范 §2.

### Buttons
*shadcn `Button`.*
- **Shape:** 14px corners, 44px minimum height (`--radius`); the primary is 18px and 56px.
- **Primary** (`default`): Safelight fill, Fixer Black text, Raised shadow, full width; may carry a mono cost after a middle dot ("Generate · 2 credits") at 72% opacity. When the action is buying Starter, a pack, or "Get credits · N needed", the same button takes the neutral Bone fill; for the Max checkout it takes the gold-foil fill with near-black text.
- **Ghost** (`secondary`): bone at 6% with a hairline; used for Log in, Replace photo, Continue with Apple / email, Preview. Small ghost buttons in bars are 36px pills with an invisible hit area expanded to 44px.
- **Quiet** (`ghost`) and **Link** (`link`): bone text; links take a 16px Safelight chevron.
- **Press:** scale to 0.975 over 180ms on the house ease; no hover-only states.

### Chips
*shadcn `ToggleGroup` (single).* 36px pills, bone 6% fill, hairline, Bone Dim label at 14px; selected is a solid Bone fill with Darkroom Black text and no edge. Hit area extended to 44px.

### Segmented Control
*shadcn `ToggleGroup` (single), styled as a segment.* Monthly / Yearly on the paywall: a 4px-padded bone 6% track with a hairline, a Bone thumb that slides on the spring curve, pressed label in Darkroom Black.

### Choice Cards
*shadcn `RadioGroup` with card items.* Size tiles (four across, 100px, a drawn ratio glyph, name, mono ratio), resolution cards (name, mono px, use line, serif credit numeral right), credit packs, payment rows. Rest: Tray or Graphite with a hairline. Chosen: a 1.5px Safelight rim plus a faint Safelight wash on workspace choices; a 1.5px Bone rim on paywall packs and pay rows. The native radio stays in the DOM for keyboard and screen readers; focus shows the Safelight ring.

### Cards / Containers
*shadcn `Card`, `Table`, `Accordion`.*
- **Corner Style:** 22px panels, 20px facts and cost tables.
- **Background:** Tray; Graphite for paywall choices.
- **Shadow Strategy:** Hairline edge with a faint top highlight (see Elevation).
- **Internal Padding:** 12–18px.
- Tables use Rule dividers between rows; the Shotviva column of the cost table is washed in Safelight at 9%. The FAQ is an accordion with a round plus that turns 45° and fills Safelight when open; answers stay in the page source.

### Inputs / Fields
*shadcn `Textarea` + `Label`.*
- **Style:** bone 4% fill, inset 1px Input stroke, 16px corners, 14px padding, 16px Geist text, 300-character counter in mono below.
- **Focus:** a 1.5px Safelight inset ring plus a 4px Safelight halo at 14%.
- **Label:** "Anything to change? (optional)"; the word "prompt" never appears.

### Navigation
*Self-built bottom tab bar and nav bar (§2).*
- **Tab bar:** fixed, four equal columns (Create, Wishlist, Photos, Account), 50px rows plus the bottom safe area, blurred translucent black with a top hairline, 24px stroke icons. Current tab: Bone label and Safelight icon. A Safelight count badge may sit on Photos. Labels follow the 14px caption floor.
- **Nav bar (flow pages):** sticky, blurred black; back link with a Safelight chevron left, template name fading in after 60px of scroll, balance chip right.
- **Marketing app bar:** wordmark in Instrument Serif with a Safelight period, a hairline divider, the tagline "AI photo studio" in caption, and a ghost "Log in" pill.
- **Balance chip:** a pill with a Safelight coin carrying the number and "6 free" beside it; links to the paywall.

### Template Card
*Self-built (§2).* A 4:5 media well (16px corners, hairline) holding the before and after plates, the after clipped to the right half, a 1.5px white seam at 50%, a "Phone" tag bottom-left on a dark frosted scrim and an "AI" tag bottom-right in Safelight. Video and animated templates add a 26px frosted media-type badge top-left; still templates never do. Below: name (item title), use (caption, Ash, one line), and a mono cost tag "from 2 credits" on a bone 6% plate. The whole card is one button that opens the template preview sheet and presses to 0.97.

**The Always-Visible Split Rule.** A template card shows the phone photo and the AI result at the same time, at rest, labelled "Phone" and "AI". No toggle, no hover, nothing to tap first. The homepage generator and the preview sheet use the same two words.

**The Quiet Loop Rule.** A template video is muted, loops, plays inline and shows no controls. It plays only while it is in view and pauses when it leaves. The poster frame (the split image) shows first and the video loads after. With reduced motion, only the poster is shown and it never plays.

### Compare Slider
*Self-built (§2).* A 4:5 well with 20px corners; the after plate clipped at the handle position, a 2px white seam and a 40px frosted round knob with a double chevron. A full-surface transparent range input gives one-finger drag, tap-to-jump and keyboard control. "Phone" and "AI" tags top corners; no badge on the image (The No Badge Rule).

### Upload Zone
*Self-built (§2).* On the homepage: a 4:5 well inside the generator card with the viewfinder brackets, a mono "4:5" readout, the Pure White split as the at-rest picture under a dark fade, and a 64px shutter (bone disc in a bone ring) over "Add your phone photo" and the format line. In the workspace: a 16:9 hatched recess with the same copy and two stacked buttons, "Take photo" and "Choose from gallery"; once filled, a 4:5 thumbnail with an "Uploaded" success tick, a mono file size and a ghost Replace photo.

### Progress Card
*Self-built (§2), with shadcn `Progress`.* While a photo develops: the photo as a greyed negative with the positive revealed above a Safelight scan line, frosted "Developing" and size pills, then a Tray list of the three stages (Compressing, Uploading, Generating) with success ticks for done stages, a pulsing Safelight dot for the current one, a 4px Safelight progress bar and a mono percentage. In Photos the same idea is a row: a greyed thumbnail with a scan line, name, mono settings line, progress bar and a Safelight state dot.

### Action Bar
*Self-built (§2).* Fixed at the bottom of flow pages on a blurred translucent black with a top hairline: an optional one-line notice (16px Ash eye icon, Bone Dim text, the key sentence in Bone) and the one primary. On the paywall the same bar is the checkout: primary plus one line of fine print.

### Bottom Sheets and Paywall Drawer
*shadcn `Drawer` (vaul) on phone, `Dialog` from `md` up (Responsive Dialog). The paywall drawer is the self-built §2 component on top of it.* Sheet surface, 30px top corners, a 38×5px grab bar, a 44px close target with a 30px bone 8% disc, drag-to-dismiss (past 120px or a fast flick), a black scrim at 62% with a 2px blur, focus returned to the opener on close. Template preview sheet: serif title, category and use line, the compare slider (or the looping video, or the animated image), a three-up price strip (Standard 2, HD 4, Max 6 credits, in mono), and "Use this template". The paywall sheet pushes the page behind it back (scale 0.92, 55% brightness) like an iOS page sheet.

**The Tier Materials Rule.** Starter is matte graphite: flat, hairline, no light. Pro is sapphire glass: a deep blue gradient with a corner light, a cool rim and a top highlight, its name in Sapphire Ink, the only flag in solid Sapphire. Max is black and gold: a black gradient with a gold corner light, a gold-foil rim that turns slowly and a slow sheen, its name and price in solid Max Gold, gold check, gold-foil flag, gold-foil checkout. Under reduced motion the rim and sheen hold still.

**The Live Perks Rule.** Each tier lists only perks that are live today, under "Includes" or "Everything in X, plus", with a check. Perks that are not live sit below in their own group headed "Coming soon", in Ash caption text without checks, never mixed into the live list. Tier copy never promises queue priority or faster generation.

### Badges and Tags
*shadcn `Badge`.* Pills (28px, bone 7%, Bone Dim) for sizes and states; on-photo "Free · public" (dark) and "Paid · private" or "Private" (Safelight or Bone) tags; mono cost plates on cards.

### Credit Cost and Balance

**The Credits Unit Rule.** Prices, charges and balances are always in credits: "Generate · 2 credits", "from 2 credits", "$0.23/credit", "6 free". The phrase "3 free Standard images" appears only on the marketing page, the sign-up prompt and the FAQ; inside the app the gift is "6 free credits".

## Do's and Don'ts

### Do:
- **Do** keep one filled, full-width, 56px primary per screen in the thumb zone (The One Primary Rule).
- **Do** set every input and textarea at 16px or larger (The 16px Input Rule).
- **Do** keep every caption at 14px or larger and measure Ash and Bone Dim at 4.5:1 or better on the lightest point of every surface, including each paywall tier (The 13px→14px Contrast Rule).
- **Do** show every template card as a split at rest with "Phone" and "AI" tags (The Always-Visible Split Rule).
- **Do** play template videos muted, looped, inline, without controls, only while in view, poster first, poster only under reduced motion (The Quiet Loop Rule).
- **Do** write prices, charges and balances in credits; keep "3 free Standard images" to the marketing page, sign-up prompt and FAQ (The Credits Unit Rule).
- **Do** tell tiers apart by material: graphite, sapphire glass, black and gold with solid gold type and a gold rim (The Tier Materials Rule).
- **Do** list only live perks with checks and put the rest in a separate grey "Coming soon" group (The Live Perks Rule).
- **Do** draw edges as inset 1px bone hairlines and keep drop shadows to the Raised and Sheet levels.
- **Do** keep stand-in images clean: no "Illustrative example" badge on any image (Owner 2026-11-07, The No Badge Rule). The disclosure lives in text instead: the alt text says "(illustrative example)", and a section that shows template examples keeps its one plain caption line ("Template images are illustrative examples").
- **Do** reserve Geist Mono for measurements.
- **Do** map each component to shadcn/ui (new-york) or a 规范 §2 self-built component, using the `:root` variables, not literal colours.

### Don't:
- **Don't** use Safelight as a wash behind body text or as decoration; it marks action, the AI side, the current place and live progress.
- **Don't** put a second filled button on a screen that already has its primary.
- **Don't** dim Ash text with opacity, and don't run a sheen or gradient light behind text where it drops below 4.5:1.
- **Don't** add a before/after toggle, a hover reveal or a media-type badge to still template cards.
- **Don't** autoplay video that is off-screen, or play it at all under reduced motion.
- **Don't** mix "Coming soon" perks into the live list, and don't claim queue priority or faster generation on any tier.
- **Don't** animate the film grain.
- **Don't** write "prompt", "seed" or "guidance" in product UI.
- **Don't** set display type bold or in capitals.
