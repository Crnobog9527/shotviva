export const versionCopy = {
  duplicate: '复制模板', created: '已创建独立的下架副本。',
  history: '提示词版本', preview: '预览', choose: '使用此版本', active: '当前生效',
  staged: (v: number) => `已选 v${v}，点「保存」后用于试跑和正式出图。`,
  hint: '可预览已留档的版本。旧模板从开始留档时的版本起显示。',
  loading: '读取中…', more: '更早版本', retry: '重试', loadError: '版本读取失败，请重试。',
  confirm: '使用此版本将替换编辑框里未保存的提示词、模型参数、供应商和画风参考图。继续吗？',
  refs: (n: number) => `画风参考图：${n} 张`, model: '供应商', defaultModel: '默认模型', unavailable: '原供应商不可用',
}
