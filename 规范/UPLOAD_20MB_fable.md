# 上传 20MB 与存储：技术方案（Fable，2026-11-05）

> Owner 要求：用户上传图片最大支持 20MB。本文只回答「怎么做」和「存在哪」，供总控窗口并入 ARCHITECTURE / AGENTS / LAUNCH。

## 0. 结论

**20MB 是「文件选择器接受的上限」，不是「要传到服务器的大小」。** 手机端先把图压到长边 2048、JPEG 0.85（通常 0.5～2MB），浏览器直传 R2；Vercel 函数全程不经手图片字节，进和出都不经手。原图 v1 不上传、不存。

这样做之后，「支持 20MB」的全部实现就是一行 `file.size <= 20 * 1024 * 1024` 的前端校验加一个压缩函数，没有任何服务端大文件处理。

## 1. 三条硬约束（第一性原理）

| 约束 | 事实 | 推论 |
|---|---|---|
| Vercel 函数请求体和响应体上限都是 4.5MB | 20MB 原图、甚至 5MB 的压缩图都过不去 | 图片字节不能经过函数：上传走浏览器→R2 直传，出图结果函数写 R2 后只返回地址 |
| GPT-Image 的输入按像素计费、按像素看图，输出最大边 1536（gpt-image-1；2.5 以实际文档为准）；输入文件限制 <50MB | 2048 长边以上的输入对出图质量零增益，只多花上传时间 | 模型输入统一用 2048 长边的压缩图，20MB 原图对产品没有价值 |
| 规范已定原图 7 天删除 | 原图不是产品资产，只是一次性的模型输入 | 既然模型输入用压缩图就够，原图根本不用上传 |

## 2. 链路

```
手机选图（≤20MB；accept="image/jpeg,image/png,image/webp"，不列 heic）
 │  浏览器校验 size / type
 ▼
浏览器压缩：长边 2048、JPEG 0.85、重编码顺带丢掉 EXIF（含 GPS）→ 0.5～2MB
 │
 ├─ POST /api/uploads  →  { input_key, put_url }     ← 服务端生成 key，presigned PUT 60 秒有效
 │
 ▼
浏览器 PUT put_url（直传 R2  inputs/{user_id}/{uuid}.jpg）
 │
 ├─ POST /api/generate { input_key, template_id, inputs }
 │      函数：HEAD 对象 → 校验 ≤20MB、Content-Type 白名单，不合格删除并 422
 │           从 R2 读压缩图（1～2MB）→ OpenAI images/edits → 结果 b64
 │           PutObject  outputs/{user_id}/{job_id}.png → 返回 job 状态（不返回字节）
 ▼
前端 GET /api/files/{job_id}（下载路由：鉴权 + 按付费身份叠水印，AUDIT2 #5）
```

扣积分仍在 `/api/generate`，上传本身不扣。

## 3. 原图怎么办：不传

- **压缩失败才回退**（老浏览器、低端机内存不够）：同样的 presigned PUT 直传原图（≤20MB），服务端用 sharp 缩到 2048 再送模型。sharp 在 Vercel 上能解 JPEG/PNG/WebP，解不了 HEIC → 返回 `invalid_input`「请换 JPEG」。
- **以后要「高清放大 / 打印」**再加 `originals/` 前缀 + lifecycle 7 天。现在不做；AUDIT2 #2 里写的 `originals/` 以本文为准改成不上传原图。

## 4. R2 布局与规则

- 一个**私有桶**，不开公开访问；所有读取走签名 GET 或 `/api/files/*` 路由。
- 前缀：`inputs/`（lifecycle 7 天自动删）、`outputs/`（按规范保留期）。
- 桶 CORS 必须允许站点域名的 `PUT` 和 `Content-Type` 头——这是直传最常见的坑，LAUNCH 要加一条。
- 预览环境和生产用两个桶（或两个前缀 + 不同密钥），避免预览联调污染生产。
- 成本：1 万单/月，输入 2MB×7 天 + 输出 2MB 长期 ≈ 20～30GB，R2 约 $0.5/月，出流免费。可以忽略。

## 5. 大小与滥用控制

- presigned PUT：60 秒有效，key 由服务端生成（用户不能指定路径），每用户每小时次数复用现有限频。
- PUT 签名不能像 POST policy 那样限制 `content-length-range`，所以**生成前 HEAD 校验**对象大小 ≤20MB 和类型；这一步是硬性的，不能省。
- 没发起生成的上传对象由 lifecycle 7 天清掉，不用单独写清理任务。

## 6. 边界情况

| 情况 | 处理 |
|---|---|
| iPhone HEIC | `accept` 不列 heic，iOS Safari 选相册时自动转成 JPEG 交给页面 |
| Android HEIC（三星开了 HEIF） | 浏览器解不了 → 压缩失败 → 回退直传 → sharp 解不了 → 422 提示换 JPEG。MVP 可接受 |
| 20MB ≈ 48MP 在手机上解码 | 优先 `createImageBitmap(file, { resizeWidth })` 让浏览器原生缩放；不支持时退回 `<img>` + canvas。或直接用 `browser-image-compression`（Web Worker，几十行省掉）。两者都行，别自己写 worker |
| EXIF 方向 | 现代浏览器默认按 EXIF 方向绘制，canvas 重编码后方向固化，服务端不用再处理 |
| PNG 截图 / 透明 | 统一转 JPEG，透明丢失——菜品照不需要透明 |
| 压缩完还 >4.5MB（极端大图 + 复杂纹理） | 和函数无关，直传 R2 没有这个限制；只是提醒别把「压缩后再 POST 给函数」当备选 |

## 7. 工作量

前端压缩 + 直传 1 天；`/api/uploads` + HEAD 校验 + `/api/generate` 读 R2 1 天；R2 CORS / lifecycle / 双桶 半天。**合计 2～2.5 天**，已包含在 AUDIT2 §5 任务卡 T4「上传与出图」里，不另加。

## 8. 对规范的改动（给总控窗口）

1. ARCHITECTURE 上传一节按 §2 链路写：浏览器压缩 → 直传 → HEAD 校验；明确「原图不上传」。
2. AGENTS 加一条硬规则：**任何 API 路由不得接收或返回图片字节**（4.5MB 限制），只传 key / 签名地址。
3. LAUNCH 加：R2 桶 CORS、`inputs/` lifecycle 7 天、预览与生产桶隔离、HEAD 校验测试（上传一个 25MB 和一个改后缀的文件都应 422）。
4. DESIGN 加上传状态：「压缩中 → 上传中（进度）→ 生成中」三段，20MB 在 4G 上压缩约 1～3 秒、上传 1～5 秒，要有反馈。
