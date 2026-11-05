# Product

<!-- impeccable:product-schema 1 -->

> Location note: lives in `design/` (not the repo root) because T6 may only write here. Move to the repo root when the T0 scaffold exists.

## Platform

web

## Stack
Next.js 16 (App Router) + React 19 + Tailwind v4 + shadcn/ui (new-york), Magic UI optional on marketing pages only. Fonts self-hosted via `next/font`. (Source: 规范/AGENTS.md §2, 规范/DESIGN.md §2.) The T6 comps themselves are static HTML.

## Users
Owners and staff of small businesses and independent sellers who need good-looking images of what they sell and have no designer, no photographer, and no AI vocabulary: online shops, beauty and fashion sellers, home-goods makers, cafés and restaurants, anyone posting products on social media. They work mostly on a phone, often between other jobs. v1 is English only. Food & drink is one template category among several (Products, Beauty, Fashion, Home, Social posts), not the audience definition (Owner, 2026-11-05).

## Product Purpose
Shotviva (shotviva.com) is a general template-based AI image generator: the user picks a ready-made template, uploads their own photo, adds a line of text if the template asks for it, and gets a finished image. Every design need is packaged as a template so the user "copies a look" without writing a prompt. Food / product photos are the first module, not the whole product (Owner, 2026-11-05: "不能做成像只针对餐厅用户开发的"). Success = a first-time visitor reaches a generated image in three steps.

## Positioning
Templates instead of prompts: the subject in the user's photo (a product, a room, a pet, a dish) stays exactly as shot; only light, background and scene change, plus one line of text when the template takes it. No chat box. One optional field, "Anything to change? (optional)" (≤300 characters, the word "prompt" never appears), lets power users ask for elements to add, remove or adjust; templates stay the main path (规范 PR #30, Owner 2026-11-05). Positioning: a general photo-to-finished-image AI tool; selling points: subject kept as shot, no prompts, 3 steps.

## Operating Context
- Marketing pages (SEO): homepage is a tool landing page with seven fixed blocks (ARCHITECTURE §13); all body copy must be in page source, never hidden in accordions or modals (建站规格 R5).
- App pages: mobile app shell, bottom tab bar Create / Photos / Account; flow pages (workspace, generating, result) hide the tab bar and use a back button + one fixed bottom action (DESIGN §8).
- Phone camera / gallery upload, JPG / PNG / WebP up to 20MB, three visible stages Compressing → Uploading → Generating.
- Free: 3 free Standard images at sign-up (6 credits; 规范 PR #35); photos made with free credits are public with a watermark. Paid (规范 ARCHITECTURE §6.2, revised 2026-11-05 evening): `monthly` and `yearly` (subscription on card, one-time on Alipay/WeChat) plus a one-time credit `pack`; photos made with paid credits are private and watermark-free. Credit amounts and prices undecided.

## Capabilities and Constraints
- Terminology: the unit is "credits" for pricing and balances; the new-user gift is told as "3 free Standard images" (Owner 2026-11-05, 规范 PR #35) front and back ("Generate · 2 credits", balance "30 credits + 3 free"; 规范 DESIGN §4.3, 2026-11-05 evening); also "photo", "template". Never prompt, seed, guidance in product UI.
- Payment methods shown in two groups: "Card · Apple Pay · Google Pay" and "Alipay · WeChat Pay" (WeChat absent on Waffo).
- Prices: undecided; read from `site.config.ts`, never hard-coded. Comps use placeholders.
- Dark theme ("the street after closing", Owner chose dark 2026-11-05, 规范 PR #21); contrast WCAG AA; touch targets ≥ 44px; inputs 16px.

## Brand Commitments
- Name always "Shotviva". Tagline always next to the logo: "AI photo studio" (Owner final 2026-11-05, 建站规格 PR #29). Positioning: a general image to image AI tool; food is one category among six.
- Dark theme, not food-themed colours (Owner 2026-11-05; supersedes the 11-04 light-first decision).
- Each page carries one of the three selling points: subject kept as shot, no prompts, 3 steps.

## Evidence on Hand
None yet. No real before/after photos, no testimonials, no customer logos, no prices. Comps use labelled illustrative stock photos; do not invent customers, ratings, or numbers beyond the spec (3 free images, 20–40 s, platform sizes).

## Product Principles
1. One look, one primary action per screen.
2. Show the result before asking for effort: every entry opens on a before/after.
3. Three steps: template → photo (+ text) → generate.
4. The phone is an app, not a shrunken website.
5. The user's photo is the hero; the interface stays out of its way.

## Accessibility & Inclusion
WCAG 2.1 AA; reduce-motion respected; keyboard-completable; errors announced next to fields.
