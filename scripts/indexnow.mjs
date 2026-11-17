import { readFile } from 'node:fs/promises'

const origin = 'https://shotviva.com'
const key = (await readFile(new URL('../public/indexnow-key.txt', import.meta.url), 'utf8')).trim()
const urls = [...new Set(process.argv.slice(2))]
if (!/^[a-f0-9]{32}$/.test(key) || urls.length === 0) throw new Error('Provide one or more production URLs')
if (urls.some((url) => !url.startsWith(`${origin}/`) || new URL(url).origin !== origin || new URL(url).search || new URL(url).hash)) {
  throw new Error('Only canonical HTTPS production URLs without query strings are allowed')
}

const fetchText = async (url) => {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`${url} returned ${response.status}`)
  return response.text()
}
const location = `${origin}/indexnow-key.txt`
if ((await fetchText(location)).trim() !== key) throw new Error('Production key is not deployed or does not match')
const sitemapIndex = await fetchText(`${origin}/sitemap.xml`)
const locs = (xml) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((match) => match[1])
const maps = locs(sitemapIndex)
if (!maps.length || maps.some((url) => new URL(url).origin !== origin)) throw new Error('Invalid production sitemap index')
const allowed = new Set((await Promise.all(maps.map(fetchText))).flatMap(locs))
if (urls.some((url) => !allowed.has(url))) throw new Error('Each URL must be in the production sitemap')
const response = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: 'shotviva.com', key, keyLocation: location, urlList: urls }),
  signal: AbortSignal.timeout(15000),
})
if (![200, 202].includes(response.status)) throw new Error(`IndexNow returned ${response.status}`)
console.info(`IndexNow returned ${response.status} for ${urls.length} URL(s); indexing is not guaranteed`)
