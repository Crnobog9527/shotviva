// Turns loadtest/results/<label>-<scenario>-<level>.{json,csv} into one markdown table:
// request p50/p95 per level, error and bounced-session rates, throughput, generate duration,
// and the database samples (connections, longest query, CPU) taken during that level.
//   node loadtest/run/summarize.mjs [label...]
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(import.meta.dirname, '..', 'results')
const labels = process.argv.slice(2)
const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
const ms = (v) => (v === undefined ? '–' : v >= 1000 ? (v / 1000).toFixed(2) + ' s' : Math.round(v) + ' ms')
const pct = (v) => (v * 100).toFixed(1) + '%'

function db(name) {
  try {
    const rows = readFileSync(join(dir, name + '.csv'), 'utf8').trim().split('\n').slice(1).map((r) => r.split(','))
    const col = (i) => rows.map((r) => Number(r[i])).filter((n) => Number.isFinite(n))
    const max = (i) => Math.max(0, ...col(i))
    const avg = (i) => { const c = col(i); return c.length ? c.reduce((a, b) => a + b, 0) / c.length : 0 }
    return { active: max(1), idleTx: max(3), longest: max(5), cpu: avg(6), cpuMax: max(6) }
  } catch { return null }
}

const rows = []
for (const f of files) {
  const m = f.match(/^(.+)-(marketing|create|photos|generate)-(\d+)\.json$/)
  if (!m || (labels.length && !labels.includes(m[1]))) continue
  const s = JSON.parse(readFileSync(join(dir, f), 'utf8')).metrics
  const d = s.http_req_duration ?? {}
  const checks = s.checks ?? { passes: 0, fails: 0 }
  const g = s.generate_duration
  const text = readFileSync(join(dir, f.replace('.json', '.txt')), 'utf8')
  const bounced = [...text.matchAll(/signed in\n\s+↳\s+\d+% — ✓ (\d+) \/ ✗ (\d+)/g)].reduce((a, x) => [a[0] + +x[1], a[1] + +x[2]], [0, 0])
  rows.push({
    label: m[1], scenario: m[2], level: +m[3], p50: d.med, p95: d['p(95)'], max: d.max,
    failed: s.http_req_failed?.value ?? 0, checkFail: checks.fails / Math.max(1, checks.passes + checks.fails),
    bounced: bounced[0] + bounced[1] ? bounced[1] / (bounced[0] + bounced[1]) : null,
    rps: s.http_reqs?.rate, gen50: g?.med, gen95: g?.['p(95)'], db: db(f.replace('.json', '')),
  })
}
rows.sort((a, b) => a.scenario.localeCompare(b.scenario) || a.level - b.level || a.label.localeCompare(b.label))
console.log('| 场景 | 并发 | 版本 | p50 | p95 | 最大 | 请求/s | HTTP 失败 | 检查失败 | 被弹回登录 | 生成 p50 / p95 | DB 活跃连接峰值 | 最长查询 | DB CPU 均值 / 峰值 |')
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
for (const r of rows) {
  console.log(`| ${r.scenario} | ${r.level} | ${r.label} | ${ms(r.p50)} | ${ms(r.p95)} | ${ms(r.max)} | ${r.rps?.toFixed(1)} | ${pct(r.failed)} | ${pct(r.checkFail)} | ${r.bounced === null ? '–' : pct(r.bounced)} | ${r.gen50 ? ms(r.gen50) + ' / ' + ms(r.gen95) : '–'} | ${r.db?.active ?? '–'} | ${r.db ? ms(r.db.longest) : '–'} | ${r.db ? Math.round(r.db.cpu) + '% / ' + Math.round(r.db.cpuMax) + '%' : '–'} |`)
}
