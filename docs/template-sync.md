# 测试站模板同步到正式站

在 GitHub → Actions → **Sync preview templates to production** 选择 main，填模板 ID（可用逗号、空格或换行分隔）。Owner 在该次运行的 **Review deployments** 核对 ID 并批准。新增模板需要在正式站后台检查后上架，更新已上架模板会直接修改其内容。后台可立即核对，公开页面按已有缓存策略更新。

首次启用时，在仓库 Settings → Environments 建立 `template-sync-approval`，只允许 main，Required reviewers 选仓库 Owner。Owner 自己发起时也要能批准。工作流核对本次运行的实际审批记录；缺少审批、跳过审批或由其他人批准都会停止。

在已有的 **production** environment 配置以下运行参数。密钥只在同步步骤使用。

| 类别 | 名称与范围 |
|---|---|
| Supabase secrets | `SYNC_PREVIEW_SERVICE_KEY`、`SYNC_PRODUCTION_SERVICE_KEY`，分别对应测试库和正式库的服务端密钥 |
| 测试 R2 secrets | `SYNC_PREVIEW_R2_ACCOUNT_ID`、`SYNC_PREVIEW_R2_ACCESS_KEY_ID`、`SYNC_PREVIEW_R2_SECRET_ACCESS_KEY`，限 `shotviva-assets-preview` 桶只读 |
| 正式 R2 secrets | `SYNC_PRODUCTION_R2_ACCOUNT_ID`、`SYNC_PRODUCTION_R2_ACCESS_KEY_ID`、`SYNC_PRODUCTION_R2_SECRET_ACCESS_KEY`，限 `shotviva-assets` 桶读写 |
| Variables | `SYNC_PREVIEW_ASSETS_BASE` 与测试站实际封面 URL 前缀一致。正式公开前缀为 `https://shotviva.com/assets`。若正式部署覆盖了默认 `OPENAI_IMAGE_MODEL`，此处设为相同值供 T96 定价使用。 |

每个 ID 单独提交。一项失败时其他 ID 继续，整次运行标红。修正后可点 **Re-run failed jobs**，同一 run 已成功的 ID 直接返回原版本。重新发起一次 dispatch 会创建新版本。

- `STALE_TARGET` 表示上传封面期间另一同步或后台编辑已保存。先在正式后台核对要保留的内容，再决定是否重新运行。
- `CATALOG_MISMATCH` 表示两站的积分单位不同，或目标已切换定价目录。等两站目录一致后再发起同步。已批准的修改价按正式后台的同一套规则校验。
- 私有画风参考图由各环境独立管理，同步只复制公开封面，保留目标已有参考图。
- `CATEGORY_MISSING` 表示需要先在正式后台建好同 key 分类。`PROVIDER_NOT_UNIQUE` 表示正式库找不到唯一的同适配器、模型和端点组合。
- `MODEL_CREDIT_FLOOR`、`MODEL_REFERENCE_LIMIT`、`MODEL_CHANGED` 分别表示积分太低、参考图张数超限、模型定价快照不适用。核对正式站后重新运行。
- `PRICE_QUOTE_CHANGED` 表示最终写入时生效的模型报价与计算同步下限时不同。本次写入已回滚，可核对正式后台的报价后重试。
- 封面按内容哈希写入，全部复制成功才切换数据库引用。若对象存储中途失败或最终数据库事务被拒绝，可能留下无引用的哈希文件；重试相同文件会复用相同路径。
- 私有 `template_sync_history` 记录 run ID、来源和正式版本，以及被替换的正式提示词、模型绑定与参数。工作流日志只显示模板 ID 和结果。排查时请勿导出提示词到 issue 或日志。
