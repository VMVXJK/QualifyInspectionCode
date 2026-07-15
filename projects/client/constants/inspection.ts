/**
 * 质检模块 UI 配置常量
 */

export const ORDER_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  incoming: { label: '来料检验', color: '#3B82F6' },
  process: { label: '过程检验', color: '#8B5CF6' },
  shipping: { label: '出货检验', color: '#10B981' },
};

export const ORDER_STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  pending: { label: '待检', color: '#F59E0B', bgColor: '#FEF3C7' },
  inspecting: { label: '审批中', color: '#3B82F6', bgColor: '#DBEAFE' },
  completed: { label: '已完成', color: '#10B981', bgColor: '#D1FAE5' },
};

export const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  pending: { label: '待检', color: '#2563EB', bgColor: '#EFF6FF' },
  inspecting: { label: '审核中', color: '#D97706', bgColor: '#FEF3C7' },
  completed: { label: '已完成', color: '#059669', bgColor: '#D1FAE5' },
  rejected: { label: '不合格', color: '#DC2626', bgColor: '#FEE2E2' },
};

export const RESULT_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  pass: { label: '合格', color: '#059669', bgColor: '#D1FAE5' },
  fail: { label: '不合格', color: '#DC2626', bgColor: '#FEE2E2' },
  pending: { label: '待检', color: '#6B7280', bgColor: '#F3F4F6' },
};

export const STATUS_OPTIONS = [
  { value: '合格', label: '合格', color: '#16A34A' },
  { value: '不合格', label: '不合格', color: '#DC2626' },
];

export const DECISION_CONFIG: Record<string, { label: string; color: string }> = {
  '接收': { label: '接收', color: '#059669' },
  '让步接收': { label: '让步接收', color: '#D97706' },
  '挑选(全检)': { label: '挑选(全检)', color: '#2563EB' },
  '判退': { label: '判退', color: '#DC2626' },
};

export const DEFECT_SEVERITY_CONFIG: Record<string, { label: string; color: string }> = {
  minor: { label: '轻微', color: '#F59E0B' },
  major: { label: '严重', color: '#DC2626' },
  critical: { label: '致命', color: '#7C3AED' },
};

export const DEFECT_TYPES = ['外观缺陷', '尺寸偏差', '功能异常', '包装破损', '标签错误', '其他'];
