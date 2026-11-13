import { CLIENT_SCRIPT } from './client-script'
import { HERO_WIDTH, LAB_FONT_FILES, LAB_HERO_FILES, SMALL_WIDTH, type LabConfig } from './sources'

// An internal measuring tool, not a site page: Chinese only (like the admin, DESIGN §7), no
// site chrome, no analytics, noindex. The config goes in a JSON script tag; "<" is escaped so a
// key can never close the tag.
const CARRIERS = ['中国移动', '中国联通', '中国电信', '中国广电', '其他']
const NETWORKS = ['5G', '4G', 'Wi-Fi（宽带）', '其他']

const options = (values: string[]) => values.map((v) => `<option>${v}</option>`).join('')

const STYLE = `body{margin:0;padding:16px;font:15px/1.5 -apple-system,system-ui,sans-serif;background:#fff;color:#111}
h1{font-size:19px;margin:0 0 8px}p{margin:6px 0;color:#444}label{display:block;margin:8px 0 2px;font-weight:600}
select,input,textarea{width:100%;box-sizing:border-box;font:inherit;padding:8px;border:1px solid #ccc;border-radius:8px}
button{font:inherit;padding:10px 16px;margin:12px 8px 0 0;border:0;border-radius:8px;background:#111;color:#fff}
button:disabled{opacity:.4}#status{margin-top:10px;font-weight:600}
.wrap{overflow-x:auto;margin-top:12px}table{border-collapse:collapse;font-size:13px;min-width:560px}
th,td{border:1px solid #ddd;padding:4px 6px;text-align:right}td:first-child,th:first-child{text-align:left}
textarea{height:120px;margin-top:8px;font-size:11px}`

const BODY = `<h1>图片加载测速</h1>
<p>同一批模板封面，分别从下面几个来源加载，比较谁快。全程约 1–3 分钟，会用掉约 10–20 MB 流量。</p>
<p>请用<strong>系统浏览器</strong>打开（微信里也可以测，备注里写「微信」）。测的时候不要切走页面。</p>
<label for="carrier">运营商</label><select id="carrier">${options(CARRIERS)}</select>
<label for="net">网络</label><select id="net">${options(NETWORKS)}</select>
<label for="note">备注（城市、手机型号、是否在微信里，可不填）</label><input id="note" maxlength="60">
<button id="start" type="button">开始测速</button><button id="copy" type="button">复制结果</button>
<div id="status"></div><div id="copied"></div>
<div class="wrap"><table><thead><tr><th>来源</th><th>首张（含建连）</th><th>热 中位</th><th>热 P90</th><th>热 成功</th>
<th>冷 中位</th><th>冷 P90</th><th>冷 成功</th></tr></thead><tbody id="rows"></tbody></table></div>
<p>单位：毫秒（一张图从发请求到收完）。热 = CDN 已缓存；冷 = CDN 没缓存、要回源。失败 = 20 秒内没加载完或打不开。</p>
<p>「小图」两行是网站卡片实际用的压缩图（AVIF/WebP，约 6–15 KB），其余行是原图（约 140 KB）。小图的「冷」：Vercel 那行仍是 Vercel 缓存，img-eo 那行是 EdgeOne 没缓存、回源到 Vercel。「首屏大图」两行是首页第一屏的图（手机上最先看到的大图，约 25–30 KB）。「静态文件」两行是网页的字体文件（约 45 KB，脚本、样式也是同类文件），比较它们从 Vercel 和从 img-eo 下载的速度。</p>
<textarea id="out" readonly></textarea>`

export function labPageHtml(config: LabConfig): string {
  const json = JSON.stringify({ ...config, smallWidth: SMALL_WIDTH, fontFiles: LAB_FONT_FILES, heroFiles: LAB_HERO_FILES, heroWidth: HERO_WIDTH }).replace(/</g, '\\u003c')
  const empty = config.keys.length === 0 ? '<p><strong>没有取到模板封面，暂时测不了。</strong></p>' : ''
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>图片测速</title><style>${STYLE}</style></head><body>${empty}${BODY}
<script type="application/json" id="lab-config">${json}</script><script>${CLIENT_SCRIPT}</script></body></html>`
}
