// TEMPORARY (fix/ci-db-flake evidence, removed before merge): through Kong, send HEAD or GET
// then at once a POST on the same client connection, and count the POST statuses.
const base = 'http://127.0.0.1:54321'
const key = process.env.ANON_KEY || 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'
const h = { apikey: key, Authorization: `Bearer ${key}` }
for (const first of ['HEAD', 'GET']) {
  const tally = {}
  for (let i = 0; i < 2000; i++) {
    await fetch(`${base}/rest/v1/templates?select=id&id=eq.nope`, { method: first, headers: { ...h, Prefer: 'count=exact' } }).then((r) => r.arrayBuffer())
    const r = await fetch(`${base}/rest/v1/rpc/no_such_fn_probe`, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: '{}' })
    await r.arrayBuffer()
    tally[r.status] = (tally[r.status] ?? 0) + 1
  }
  console.log(`${first} then POST x2000 -> POST statuses`, JSON.stringify(tally))
}
