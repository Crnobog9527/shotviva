// Shotviva load test against a local `next start` + local Supabase + stub (loadtest/README.md).
//   k6 run -e SCENARIO=marketing|create|generate|photos|all -e SUPABASE_ANON_KEY=… loadtest/k6/shotviva.js
import { check, sleep } from 'k6'
import http from 'k6/http'
import { Counter, Trend } from 'k6/metrics'

import { BASE, cookieHeader, ramp, signIn } from './lib.js'

const USERS = Number(__ENV.USERS || 50)
const STUB = `https://127.0.0.1:${__ENV.STUB_PORT || 8443}`
const photo = open('../.stub/input.jpg', 'b')
const generateTime = new Trend('generate_duration', true)
const generateFailed = new Counter('generate_failed')
const scenario = __ENV.SCENARIO || 'all'

const exec = { marketing: 'marketing', create: 'create', generate: 'generate', photos: 'photos' }
const scenarios = {}
for (const name of Object.keys(exec)) {
  if (scenario === 'all' || scenario === name) {
    scenarios[name] = { executor: 'ramping-vus', exec: exec[name], startVUs: 0, stages: ramp(), gracefulRampDown: '30s' }
  }
}

export const options = {
  scenarios,
  insecureSkipTLSVerify: true,
  thresholds: { http_req_failed: ['rate<0.01'] },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
}

export function setup() {
  const sessions = []
  for (let n = 1; n <= USERS; n++) sessions.push(signIn(n))
  const templates = (__ENV.TEMPLATES || 'lt-tpl-1,lt-tpl-2,lt-tpl-3,lt-tpl-6,lt-tpl-7').split(',')
  return { sessions, templates }
}

const MARKETING = (__ENV.MARKETING_PATHS || '/,/zh,/pricing,/zh/pricing').split(',')
const think = () => sleep(2 + Math.random() * 3)
const user = (data) => ({ Cookie: cookieHeader(data.sessions[(__VU - 1) % data.sessions.length]) })
const ok = (res, name) => check(res, { [`${name} 2xx`]: (r) => r.status >= 200 && r.status < 400 })
// Signed-in pages must not have been redirected to sign-in (k6 follows redirects), nor sent there
// from inside the streamed page (a redirect() after the shell is a 200 whose body carries
// NEXT_REDIRECT), nor have rendered an error boundary instead of content (a server error's digest
// on an errored Suspense boundary; client-only boundaries carry an empty one): "signed in" counts
// the first two, "rendered" the third.
const okSignedIn = (res, name) => check(res, {
  [`${name} 2xx`]: (r) => r.status >= 200 && r.status < 400,
  [`${name} signed in`]: (r) => !/\/(login|sign-?in)\b/.test(r.url) && !String(r.body).includes('NEXT_REDIRECT'),
  [`${name} rendered`]: (r) => !/data-dgst="(?!NEXT_)[^"]+"/.test(String(r.body)),
})

export function marketing() {
  const path = MARKETING[Math.floor(Math.random() * MARKETING.length)]
  ok(http.get(BASE + path, { tags: { name: 'page ' + path } }), 'marketing')
  think()
}

export function create(data) {
  const headers = user(data)
  okSignedIn(http.get(BASE + '/generate', { headers, tags: { name: 'page /generate' } }), 'create')
  think()
  const id = data.templates[Math.floor(Math.random() * data.templates.length)]
  okSignedIn(http.get(`${BASE}/generate/${id}`, { headers, tags: { name: 'page /generate/[id]' } }), 'workspace')
  think()
}

export function generate(data) {
  const headers = { ...user(data), Origin: BASE, 'Content-Type': 'application/json' }
  const ticket = http.post(BASE + '/api/uploads', JSON.stringify({ content_type: 'image/jpeg', size: photo.byteLength }),
    { headers, tags: { name: 'api uploads' } })
  if (!ok(ticket, 'upload ticket')) { generateFailed.add(1); return think() }
  const { put_url: putUrl, input_key: inputKey } = ticket.json()
  // The presigned PUT goes to the stub, not Cloudflare: same path and Host, local address.
  const [, host, rest] = putUrl.match(/^https:\/\/([^/]+)(\/.*)$/)
  ok(http.put(`${STUB}${rest}`, photo, { headers: { 'Content-Type': 'image/jpeg', Host: host }, tags: { name: 'r2 put (stub)' } }), 'r2 put')
  const id = data.templates[Math.floor(Math.random() * data.templates.length)]
  const started = Date.now()
  const job = http.post(BASE + '/api/generate', JSON.stringify({ template_id: id, input_key: inputKey, inputs: {}, expected_credits: Number(__ENV.EXPECTED_CREDITS || 120) }),
    { headers, timeout: '300s', tags: { name: 'api generate' } })
  generateTime.add(Date.now() - started)
  const done = check(job, { 'generate succeeded': (r) => r.status === 200 && r.json('status') === 'succeeded' })
  if (!done) { generateFailed.add(1); console.warn(`generate ${job.status}: ${String(job.body).slice(0, 200)}`) }
  else ok(http.get(`${BASE}/api/generate/${job.json('id')}`, { headers, tags: { name: 'api generate status' } }), 'status')
  think()
}

export function photos(data) {
  const headers = user(data)
  okSignedIn(http.get(BASE + '/photos', { headers, tags: { name: 'page /photos' } }), 'photos')
  think()
}
