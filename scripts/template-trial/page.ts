import { relative, resolve } from 'node:path'

import type { TemplateItem } from '../template-apply/schema'
import type { TrialRecord, TrialState } from './results'

// The local review page (.local/trials/index.html): per template its benchmarks, its input sets
// and every trial result, newest prompt version first. Image paths are relative, so the page and
// the images can be opened from disk; it has no prompt text and is never published.

const escape = (text: string) => text.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string)
const img = (src: string, alt: string) => `<img loading="lazy" src="${escape(src.split('\\').join('/'))}" alt="${escape(alt)}">`
const money = (usd: number | null) => usd === null ? '成本待核' : `$${usd.toFixed(3)}`

function reviewLine(item: TemplateItem) {
  const review = item.review
  if (!review) return '<p class="miss">还没有评审</p>'
  const verdict = review.status === 'pass' ? '通过' : '不通过'
  return `<p><strong>评审（v${review.version}）：${verdict}</strong>${review.notes ? ' · ' + escape(review.notes) : ''}</p>`
}

function resultCard(record: TrialRecord, pick?: string) {
  const meta = [`#${record.inputIndex + 1}.${record.k + 1}`, record.provider?.split('/').slice(1).join('/') || '', money(record.costUsd),
    record.durationMs ? `${Math.round(record.durationMs / 1000)}s` : ''].filter(Boolean).join(' · ')
  const body = record.file ? img(record.file, record.runId) : `<div class="miss">${escape(record.outcome)} ${escape(record.code ?? '')}</div>`
  const picked = record.runId === pick ? ' class="pick"' : ''
  return `<figure${picked}>${body}<figcaption>${picked ? '★ 选为封面 · ' : ''}${escape(meta)}<br><code>${escape(record.runId)}</code></figcaption></figure>`
}

function inputsBlock(item: TemplateItem, root: string, baseDir: string) {
  const sets = item.trial?.inputs ?? []
  return sets.map((input, i) => {
    const slots = Object.entries(input.slots ?? {}).map(([slot, path]) => img(relative(root, resolve(baseDir, path)), `输入 ${i + 1} · ${slot}`)).join('')
    const photo = input.photo ? img(relative(root, resolve(baseDir, input.photo)), `输入 ${i + 1}`) : slots || '<div class="miss">无照片</div>'
    const text = Object.entries(input.fields ?? {}).map(([k, v]) => `${k}: ${v}`).concat(input.note ? [`说明: ${input.note}`] : [])
    return `<figure>${photo}<figcaption>输入 #${i + 1}${input.aspectRatio ? ' · ' + escape(input.aspectRatio) : ''}<br>${text.map(escape).join('<br>')}</figcaption></figure>`
  }).join('')
}

function templateSection(item: TemplateItem, records: TrialRecord[], root: string, baseDir: string) {
  const refs = (item.trial?.references ?? []).map((p, i) => img(relative(root, resolve(baseDir, p)), `对标 ${i + 1}`)).join('')
  const versions = [...new Set(records.map(r => r.version))].sort((a, b) => b - a)
  const spent = records.reduce((sum, r) => sum + (r.costUsd ?? 0), 0)
  const rows = versions.map(v => {
    const cards = records.filter(r => r.version === v).sort((a, b) => a.inputIndex - b.inputIndex || a.k - b.k).map(r => resultCard(r, item.review?.pick)).join('')
    return `<h3>提示词 v${v}</h3><div class="grid">${cards}</div>`
  }).join('')
  return `<section id="${escape(item.id)}"><h2>${escape(item.id)} <small>${escape(item.name ?? '')} · 试跑 ${records.length} 次 · ${money(spent)}</small></h2>
${reviewLine(item)}<div class="row"><div><h4>对标图</h4><div class="grid refs">${refs || '<div class="miss">没有对标图</div>'}</div></div>
<div><h4>样图输入</h4><div class="grid">${inputsBlock(item, root, baseDir)}</div></div></div>${rows || '<p class="miss">还没有试跑结果</p>'}</section>`
}

const STYLE = `:root{--bg:#fafaf9;--fg:#1c1917;--muted:#78716c;--card:#fff;--line:#e7e5e4}
@media (prefers-color-scheme:dark){:root{--bg:#1c1917;--fg:#f5f5f4;--muted:#a8a29e;--card:#292524;--line:#44403c}}
body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,sans-serif}
section{border-top:1px solid var(--line);padding:16px 0}h2 small,figcaption,.miss{color:var(--muted);font-size:12px}
.row{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
figure{margin:0;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:6px}
img{width:100%;height:auto;border-radius:4px;display:block}figure.pick{outline:3px solid #16a34a}code{font-size:11px;word-break:break-all}nav a{margin-right:12px}`

export function buildPage(state: TrialState, items: TemplateItem[], root: string, baseDir: string, generatedAt = new Date()) {
  const records = Object.values(state.records)
  const shown = items.filter(item => item.trial || records.some(r => r.templateId === item.id))
  const nav = shown.map(item => `<a href="#${escape(item.id)}">${escape(item.id)}</a>`).join('')
  const sections = shown.map(item => templateSection(item, records.filter(r => r.templateId === item.id), root, baseDir)).join('\n')
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>模板试跑对照</title><style>${STYLE}</style></head><body><h1>模板试跑对照</h1>
<p class="miss">本地文件，不要上传。生成于 ${escape(generatedAt.toLocaleString('zh-CN'))}。</p><nav>${nav}</nav>${sections}</body></html>`
}
