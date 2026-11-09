# T94 兑换接口的 Vercel Firewall 规则

两条项目自定义规则已于 2026-11-09 经 Owner 授权发布。每条规则同时匹配 Preview、指定 HTTP 方法和完整路径，按来源 IP 独立计数。

| 规则 | Method | Request Path（完全匹配） | 计数键 | 窗口 | 超限响应 |
|---|---|---|---|---|---|
| T94 code preview (Preview) | GET | `/api/codes/preview` | IP | 固定 60 秒内 30 次 | 429 |
| T94 code redeem (Preview) | POST | `/api/codes/redeem` | IP | 固定 60 秒内 30 次 | 429 |

## 复测方法

1. 预览验收在一个新窗口期内，从同一 IP 连续发送 31 个 GET，查询参数使用格式合法的测试码。第 31 次应为 429。在 Firewall 流量日志核对命中 **T94 code preview**，以区分边缘拦截和单实例的应用限频。
2. 同一轮对 POST 发送 31 次无 Cookie 请求，携带预览站自己的 Origin。在路由收到的请求中应为 401，超过 IP 限额后应为 WAF 的 429。在 Firewall 日志核对 **T94 code redeem**。账号每滚动小时 10 次由数据库独立执行。
3. 另一个 IP 的首次请求、同 IP 下一窗口的首次请求应正常到达应用。记录部署标识、时间、状态码和命中规则名。生产发布时由总控核对规则适用 Production，再验证命中范围。

WAF 限频需要项目级配置。部署这个 PR 本身不会发布 Firewall 规则。[Vercel Firewall CLI](https://vercel.com/docs/cli/firewall)

## 2026-11-09 实测

PR #365 预览版本 `376b18a8`，北京时间 16:08 和 16:09。同一出口 IP 在连续两个固定窗口分别发送 35 次 GET 和 35 次 POST，POST 始终未登录应用。

| Preview 地址类型 | GET 第 1～30 次 | POST 第 1～30 次 | 两个接口第 31～35 次 |
|---|---|---|---|
| 不变部署地址 | 200 | 403（该地址与应用配置的分支 Origin 不同） | 均为 429 |
| 分支地址 | 200 | 401（需登录） | 均为 429 |

Vercel 指标 `vercel.firewall_action.count` 显示规则 `rule_t94_code_preview_preview_AWbqBg` 和 `rule_t94_code_redeem_preview_b06uGt` 各命中 10 次 rate-limit，路径分别为预览和兑换。第二轮的前 30 次同时验证了下一窗口恢复。不同出口 IP 的独立额度已覆盖应用单测，未做边缘双出口实测。
