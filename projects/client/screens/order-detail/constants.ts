/**
 * 检验单详情页常量定义
 * 将硬编码的选项列表集中管理，便于维护和国际化
 */

/** 检验结果选项 */
export const STATUS_OPTIONS = ['合格', '不合格'];

/** 使用决策 — 全部选项 */
export const USE_POLICY_ALL = ['接收', '返修', '报废', '判退', '不良'];

/** 使用决策 — 合格时可选 */
export const USE_POLICY_PASS = ['接收'];

/** 使用决策 — 不合格时可选 */
export const USE_POLICY_FAIL = ['返修', '报废', '判退', '不良'];

/** 根据状态获取可选的使用决策 */
export function getUsePolicyOptions(status: string | undefined): string[] {
  if (status === '合格') return USE_POLICY_PASS;
  if (status === '不合格') return USE_POLICY_FAIL;
  return USE_POLICY_ALL;
}

/** 状态映射（本地状态 → 展示样式） */
export const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: '待检', color: '#D97706', bg: '#FEF3C7' },
  inspecting: { label: '审批中', color: '#2563EB', bg: '#DBEAFE' },
  completed: { label: '已完成', color: '#059669', bg: '#D1FAE5' },
};

/** 缺陷类型选项 */
export const DEFECT_TYPE_OPTIONS = ['外观缺陷', '包装缺陷', '尺寸缺陷', '性能缺陷', '功能缺陷'];

/** 缺陷原因选项 */
export const DEFECT_REASON_OPTIONS = ['人员误操作', '管理漏洞', '机器问题', '物料原因', '检测方法'];

/** 缺陷等级选项 */
export const DEFECT_LEVEL_OPTIONS = ['轻缺陷', '重缺陷', '致命缺陷'];

/** 缺陷后果选项 */
export const DEFECT_RESULT_OPTIONS = ['返修', '挑选', '退货', '特采', '报废'];

/** 定性分析检测值选项 */
export const QUALITATIVE_OPTIONS = ['合格', '不合格', '待检'];

/** 本地缓存键生成器 */
export const BILL_DETAIL_CACHE_KEY = (id: string) => `cached_inspect_bill_${id}`;
