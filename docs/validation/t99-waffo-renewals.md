# Waffo 启用前核对

2026-11-10 用 Shotviva 测试商户签名查询 Waffo 商品目录。下表价格为 USD 税前原价；同一行的一次性和订阅商品分别查过。M/L 包的会员折扣由结账时的报价决定。

| 网站商品 | 测试商品尾号（一次性 / 订阅） | 测试后台现价 | 网站报价 | Owner 要做的事 |
| --- | --- | ---: | ---: | --- |
| Starter 月付 | 766m / uyI3 | 19.90 | 19.90 | 已匹配 |
| Starter 年付 | zlOP / NKgQ | 191.00 | 191.04 | 两个商品各加 0.04 |
| Pro 月付 | rsym / Qpg6 | 49.90 | 49.90 | 已匹配 |
| Pro 年付 | PVft / 9ll5 | 479.00 | 479.04 | 两个商品各加 0.04 |
| Max 月付 | ibxI / LYL4 | 99.00 | 99.00 | 已匹配 |
| Max 年付 | RWi7 / Yujk | 713.00 | 891.00 | 两个商品各加 178.00 |
| S 积分包 | OwTX | 9.90 | 9.90 | 已匹配 |
| M 积分包 | eGWO | 24.90 | 24.90 | 已匹配 |
| L 积分包 | tu81 | 49.90 | 49.90 | 已匹配 |

**启用条件**。在配置好测试签名和商品映射的环境运行 `pnpm pricing:waffo`。脚本以结账报价接口返回的无会员价为基准，逐项检查 USD 价格和商品启用状态。测试环境选择 Waffo 时，构建自动执行同一检查。15 项全部匹配方可通过。[本次只读核对日志](https://vercel.com/simons-projects-bfe3e99f/shotviva/56thd8Ui4wgqXgVu6C65x5WcPLWZ)

**正式商品**。切换前在商户后台 Live Mode 独立核对。按上表顺序，正式商品尾号（一次性 / 订阅）为 `GaCp / gGQY`、`lucN / ycqV`、`WYwJ / r4yX`、`9i0i / 9hfF`、`0EXS / 2Ckq`、`mtBe / 2VH7`、`d7dN`、`ltaM`、`2QRq`。本次读取的是正式映射，正式后台实价待核。

**两期实收**。Waffo 规定签名会话的 `priceSnapshot.amount` 覆盖订阅常规周期价格。要取得两期实收，在 Test Mode 用测试卡完成带 v2 报价的月付订阅，打开 Subscriptions → 该笔测试订阅 → Simulate renewal success。在两次 `subscription.payment_succeeded` 中记录期数、币种、`chargedAmount` 及 `listPrice` 的 subtotal、taxAmount、total，并核对每期只有一笔积分流水。如果目录价和首单报价相同，两期同价只能验证金额；区分取价来源还需用两价有差异的测试商品，例如改价前的年付，且测试订单采用正常服务端报价。[下单规则](https://docs.waffo.ai/api-reference/endpoints/orders/create-checkout-session.md) · [模拟续费](https://docs.waffo.ai/features/test-mode.md)

**收到金额异常告警**。打开飞书消息里的账单工单，核对用户、订单、期数及支付编号。先查该用户的积分流水和 Waffo 退款记录，再决定按新积分单位补发或退款，记录处理动作和参考号后关闭工单。同一期的后续回调保持原处理结果。
