# T94 兑换接口的 Vercel Firewall 规则

Shotviva 项目使用 Vercel WAF 按来源 IP 计数。总控在 Firewall → Configure → Custom Rules 中按下表建立规则，先将 Environment 限定为 Preview。每行的条件同时成立才计数。查看草稿差异，确认后发布，再做预览验收。

| 规则 | Method | Request Path（完全匹配） | 计数键 | 窗口 | 超限响应 |
|---|---|---|---|---|---|
| T94 code preview | GET | `/api/codes/preview` | IP | 固定 60 秒内 30 次 | 429 |
| T94 code redeem | POST | `/api/codes/redeem` | IP | 固定 60 秒内 30 次 | 429 |

1. 预览验收在一个新窗口期内，从同一 IP 连续发送 31 个 GET，查询参数使用格式合法的测试码。第 31 次应为 429。在 Firewall 流量日志核对命中 **T94 code preview**，以区分边缘拦截和单实例的应用限频。
2. 同一轮对 POST 发送 31 次无 Cookie 请求，携带预览站自己的 Origin。在路由收到的请求中应为 401，超过 IP 限额后应为 WAF 的 429。在 Firewall 日志核对 **T94 code redeem**。账号每滚动小时 10 次由数据库独立执行。
3. 另一个 IP 的首次请求、同 IP 下一窗口的首次请求应正常到达应用。记录部署标识、时间、状态码和命中规则名。生产发布时由总控核对规则适用 Production，再验证命中范围。

WAF 限频需要项目级配置。部署这个 PR 本身不会发布 Firewall 规则。[Vercel Firewall CLI](https://vercel.com/docs/cli/firewall)
