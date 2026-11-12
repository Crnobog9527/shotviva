// Local stand-in for R2 (S3 API) and the OpenAI image/moderation endpoints, for load tests:
// no real storage, no model spend. Objects live in memory (capped); the image endpoints wait
// LOADTEST_IMAGE_MS (default 20000, roughly a real 1K edit) and return a fixed PNG.
//   node loadtest/stub/server.mjs            (after loadtest/stub/gen-cert.sh)
import { readFileSync } from 'node:fs'
import { createServer } from 'node:https'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dir = join(here, '..', '.stub')
const port = Number(process.env.LOADTEST_STUB_PORT ?? 8443)
const imageMs = Number(process.env.LOADTEST_IMAGE_MS ?? 20000)
const png = readFileSync(process.env.LOADTEST_OUTPUT_IMAGE ?? join(dir, 'output.png'))
const objects = new Map()
const MAX_OBJECTS = 20000
const stats = { put: 0, get: 0, head: 0, del: 0, image: 0, moderation: 0, inflightImages: 0, maxInflightImages: 0 }

const body = (req) => new Promise((resolve) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c)).on('end', () => resolve(Buffer.concat(chunks)))
})

function s3Key(req) {
  const url = new URL(req.url, 'https://stub')
  // Virtual-hosted (bucket.account.r2...) or path-style (account.r2.../bucket/key).
  const host = (req.headers.host ?? '').split(':')[0]
  const parts = host.split('.')
  const bucket = parts.length > 4 ? parts[0] : url.pathname.split('/')[1]
  const key = parts.length > 4 ? url.pathname.slice(1) : url.pathname.split('/').slice(2).join('/')
  return { bucket, key: decodeURIComponent(key), url }
}

async function s3(req, res) {
  const { bucket, key, url } = s3Key(req)
  const id = bucket + '/' + key
  if (req.method === 'PUT') {
    const data = await body(req)
    if (objects.size >= MAX_OBJECTS) objects.delete(objects.keys().next().value)
    objects.set(id, { data, type: req.headers['content-type'] ?? 'application/octet-stream' })
    stats.put++
    res.writeHead(200, { ETag: '"lt"' }).end()
    return
  }
  if (req.method === 'GET' && url.searchParams.get('list-type') === '2') {
    const prefix = bucket + '/' + (url.searchParams.get('prefix') ?? '')
    const keys = [...objects.keys()].filter((k) => k.startsWith(prefix)).map((k) => k.slice(bucket.length + 1))
    res.writeHead(200, { 'Content-Type': 'application/xml' }).end(`<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult><Name>${bucket}</Name><KeyCount>${keys.length}</KeyCount><IsTruncated>false</IsTruncated>${
      keys.map((k) => `<Contents><Key>${k}</Key><Size>1</Size></Contents>`).join('')}</ListBucketResult>`)
    return
  }
  if (req.method === 'DELETE') { objects.delete(id); stats.del++; res.writeHead(204).end(); return }
  if (req.method === 'POST' && url.searchParams.has('delete')) {
    res.writeHead(200, { 'Content-Type': 'application/xml' }).end('<DeleteResult></DeleteResult>'); return
  }
  const object = objects.get(id)
  if (!object) {
    res.writeHead(404, { 'Content-Type': 'application/xml' }).end(req.method === 'HEAD' ? undefined : '<Error><Code>NoSuchKey</Code></Error>')
    return
  }
  const headers = { 'Content-Type': object.type, 'Content-Length': object.data.length, ETag: '"lt"', 'Last-Modified': new Date().toUTCString() }
  if (req.method === 'HEAD') { stats.head++; res.writeHead(200, headers).end(); return }
  stats.get++
  res.writeHead(200, headers).end(object.data)
}

async function openai(req, res) {
  await body(req)
  if (req.url.startsWith('/v1/moderations')) {
    stats.moderation++
    res.writeHead(200, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ id: 'modr-lt', results: [{ flagged: false, categories: {}, category_scores: {} }] }))
    return
  }
  if (req.url.startsWith('/v1/images/')) {
    stats.image++; stats.inflightImages++
    stats.maxInflightImages = Math.max(stats.maxInflightImages, stats.inflightImages)
    await new Promise((r) => setTimeout(r, imageMs))
    stats.inflightImages--
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({
      created: Math.floor(Date.now() / 1000), data: [{ b64_json: png.toString('base64') }],
      usage: { input_tokens: 1000, output_tokens: 1056, total_tokens: 2056, input_tokens_details: { text_tokens: 200, image_tokens: 800 } },
    }))
    return
  }
  res.writeHead(404, { 'Content-Type': 'application/json' }).end('{"error":{"message":"stub: unknown endpoint"}}')
}

createServer({ key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) }, (req, res) => {
  if (req.url === '/__stats') { res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ...stats, objects: objects.size })); return }
  const host = (req.headers.host ?? '').split(':')[0]
  const handle = host === 'api.openai.com' ? openai : s3
  handle(req, res).catch((error) => { res.writeHead(500).end(String(error)) })
}).listen(port, '127.0.0.1', () => console.log(`stub on https://127.0.0.1:${port} (image ${imageMs} ms)`))
