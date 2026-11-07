/**
 * Server-HTML SEO audit (建站规格 R5, LAUNCH_CHECKLIST §7): fetches every indexable page without
 * running JavaScript and checks that the SEO text is in the HTML itself, not only in the RSC
 * payload a browser hydrates from.
 *
 *   pnpm seo:ssr https://shotviva.com [--json]
 *   pnpm build && pnpm start & pnpm seo:ssr http://localhost:3000     # what CI runs
 *
 * Expected text comes from site/content, so a page whose H1, subtitle, direct answer, facts,
 * FAQ or prices stop being server-rendered fails here before it reaches production.
 */
import type { FaqItem } from '@/core/content'
import type { Locale } from '@/core/i18n'
import { legalPages } from '@/site/content/legal'
import { contentPagesIn, homePageIn, pricingPageIn } from '@/site/content/localized'
import { site } from '@/site/site.config'

type Expect = { path: string; locale: Locale; h1: string; strings: Record<string, string[]> }

const UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'

const prefix = (locale: Locale, path: string) => (locale === 'en' ? path : path === '/' ? '/zh' : `/zh${path}`)
// Markers ("from N credits") are filled from the live catalogue; check the text around them.
const pieces = (text: string) => text.split(/⟦[^⟧]*⟧/).map((s) => s.trim()).filter((s) => s.length > 8)
const usdText = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`
const faqStrings =(faq: readonly FaqItem[]) => ({
  'FAQ questions': faq.map((item) => item.question),
  'FAQ answers': faq.flatMap((item) => pieces(item.answer).slice(0, 1)),
})

function pages(): Expect[] {
  const out: Expect[] = []
  for (const locale of site.locales.enabled as readonly Locale[]) {
    const home = homePageIn(locale)
    out.push({
      path: prefix(locale, '/'),
      locale,
      h1: home.h1,
      strings: {
        subtitle: [home.subtitle],
        'direct answer': pieces(home.answerBlock),
        ...faqStrings(home.faq),
      },
    })
    const pricing = pricingPageIn(locale)
    out.push({
      path: prefix(locale, '/pricing'),
      locale,
      h1: pricing.h1,
      strings: { intro: pieces(pricing.intro).slice(0, 1), prices: site.billing.products.map((p) => usdText(p.priceUsd)), ...faqStrings(pricing.faq) },
    })
    for (const page of contentPagesIn(locale)) {
      out.push({
        path: prefix(locale, `/${page.slug}`),
        locale,
        h1: page.h1,
        strings: {
          subtitle: page.subtitle ? [page.subtitle] : [],
          'direct answer': pieces(page.answerBlock),
          facts: page.facts.map((f) => f.label).flatMap(pieces),
          ...faqStrings(page.faq),
        },
      })
    }
  }
  for (const page of legalPages) {
    out.push({ path: page.path, locale: 'en', h1: page.h1, strings: { 'section headings': page.sections.map((s) => s.heading) } })
  }
  return out
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
function decode(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name] ?? m)
}
const squash = (text: string) => decode(text).replace(/\s+/g, ' ').trim()

function split(html: string) {
  const headEnd = html.indexOf('</head>')
  const head = html.slice(0, headEnd)
  const noScripts = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, (m) => (m.includes('application/ld+json') ? m : ''))
  const visible = squash(noScripts.replace(/<script\b[\s\S]*?<\/script>/g, ' ').replace(/<style\b[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' '))
  const scripts = squash([...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join(' ').replace(/\\"/g, '"').replace(/\\n/g, ' '))
  return { head, body: noScripts.slice(noScripts.indexOf('</head>')), visible, scripts }
}

function meta(head: string, body: string) {
  const pick = (re: RegExp, src = head) => [...src.matchAll(re)].map((m) => decode(m[1]))
  const ld = [...(head + body).matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].flatMap((m) => {
    try {
      const parsed: unknown = JSON.parse(m[1])
      return (Array.isArray(parsed) ? parsed : [parsed]).map((item: { '@type'?: string }) => item['@type'] ?? '?')
    } catch {
      return ['(invalid)']
    }
  })
  return {
    title: pick(/<title>([^<]*)<\/title>/g)[0] ?? null,
    description: pick(/<meta name="description" content="([^"]*)"/g)[0] ?? null,
    canonical: pick(/<link rel="canonical" href="([^"]*)"/g)[0] ?? null,
    hreflang: pick(/<link rel="alternate" hrefLang="([^"]*)"/g),
    robots: pick(/<meta name="robots" content="([^"]*)"/g)[0] ?? null,
    metaInBody: /<meta name="(description|robots)"|<link rel="canonical"/.test(body),
    jsonLd: ld,
    h1: [...body.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => squash(m[1].replace(/<[^>]+>/g, ''))),
  }
}

async function audit(origin: string, page: Expect) {
  const res = await fetch(new URL(page.path, origin), { headers: { 'User-Agent': UA }, redirect: 'manual' })
  const html = await res.text()
  const { head, body, visible, scripts } = split(html)
  const m = meta(head, body)
  const checks = Object.entries(page.strings).map(([name, list]) => {
    const missing = list.filter((s) => !visible.includes(squash(s)))
    const onlyInScripts = missing.filter((s) => scripts.includes(squash(s)))
    return { name, total: list.length, missing, onlyInScripts }
  })
  // Featured template cards: the name in each card's label must also be visible text.
  const cards = [...body.matchAll(/data-pick-template="[^"]*" aria-label="([^"]*)"/g)].map((x) => decode(x[1]).split(/\. |。/)[0])
  checks.push({ name: 'template cards', total: cards.length, missing: cards.filter((n) => !visible.includes(squash(n))), onlyInScripts: [] })
  const h1ok = m.h1.length === 1 && squash(m.h1[0]) === squash(page.h1)
  return { path: page.path, status: res.status, xRobotsTag: res.headers.get('x-robots-tag'), bytes: html.length, ...m, h1ok, checks }
}

async function main() {
  const [origin = 'http://localhost:3000', ...flags] = process.argv.slice(2)
  const results = []
  for (const page of pages()) results.push(await audit(origin, page))
  if (flags.includes('--json')) {
    process.stdout.write(JSON.stringify(results, null, 2))
    return
  }
  let failed = 0
  for (const r of results) {
    const bad = r.checks.filter((c) => c.missing.length > 0)
    if (!r.h1ok || bad.length > 0 || r.status !== 200) failed++
    process.stdout.write(
      `${r.path} ${r.status} h1=${r.h1ok ? 'ok' : JSON.stringify(r.h1)} ld=[${r.jsonLd.join(',')}] canonical=${r.canonical} hreflang=[${r.hreflang.join(',')}] metaInBody=${r.metaInBody}\n` +
        r.checks.map((c) => `   ${c.missing.length ? 'FAIL' : 'ok  '} ${c.name} ${c.total - c.missing.length}/${c.total}${c.missing.length ? ` missing=${JSON.stringify(c.missing.slice(0, 3))} onlyInScripts=${c.onlyInScripts.length}` : ''}`).join('\n') +
        '\n',
    )
  }
  process.exitCode = failed ? 1 : 0
}

void main()
