/**
 * 质检模块 API 封装 — 预留金蝶接口切换点
 *
 * 当前直接调用本地后端（或 Mock）。
 * 后续对接金蝶时：
 * 1. 修改 client/api/client.ts 中的 baseURL 和请求拦截（加鉴权头）
 * 2. 修改本文件中各方法的 URL 路径和参数格式，适配金蝶 API 规范
 * 3. 页面代码无需改动（通过本文件导入）
 */

import { fetchJson, putJson, postJson, del } from './client';

/* ════════════════════════════════════════
   检验单
   ════════════════════════════════════════ */

export function getOrders(params?: { status?: string; searchType?: string; keyword?: string }) {
  const query = new URLSearchParams();
  if (params?.status && params.status !== 'all') query.append('status', params.status);
  if (params?.searchType) query.append('searchType', params.searchType);
  if (params?.keyword?.trim()) query.append('keyword', params.keyword.trim());
  const qs = query.toString();
  return fetchJson<{ success: boolean; data: unknown[] }>(`/api/v1/inspection/orders${qs ? `?${qs}` : ''}`);
}

export function getOrder(orderId: number) {
  return fetchJson<{ success: boolean; data: unknown }>(`/api/v1/inspection/orders/${orderId}`);
}

export function updateOrder(orderId: number, data: { status?: string; [key: string]: unknown }) {
  return putJson<{ success: boolean; data: unknown }>(`/api/v1/inspection/orders/${orderId}`, data);
}

export function submitOrder(orderId: number) {
  return updateOrder(orderId, { status: 'completed' });
}

/* ════════════════════════════════════════
   物料
   ════════════════════════════════════════ */

export function getMaterials(orderId: number) {
  return fetchJson<{ success: boolean; data: unknown[] }>(`/api/v1/inspection/orders/${orderId}/materials`);
}

export function updateMaterial(materialId: number, data: { inspection_result?: string; overall_verdict?: string; [key: string]: unknown }) {
  return putJson<{ success: boolean; data: unknown }>(`/api/v1/inspection/materials/${materialId}`, data);
}

/* ════════════════════════════════════════
   检验项目
   ════════════════════════════════════════ */

export function getItems(materialId: number) {
  return fetchJson<{ success: boolean; data: unknown[] }>(`/api/v1/inspection/materials/${materialId}/items`);
}

export function updateItem(itemId: number, data: { test_value?: string; is_qualified?: string; [key: string]: unknown }) {
  return putJson<{ success: boolean; data: unknown }>(`/api/v1/inspection/items/${itemId}`, data);
}

/* ════════════════════════════════════════
   缺陷记录
   ════════════════════════════════════════ */

export function getDefects(materialId: number) {
  return fetchJson<{ success: boolean; data: unknown[] }>(`/api/v1/inspection/materials/${materialId}/defects`);
}

export function addDefect(data: {
  material_id: number;
  defect_type: string;
  defect_count: number;
  defect_reason?: string;
  severity: string;
}) {
  return postJson<{ success: boolean; data: unknown; message?: string }>('/api/v1/inspection/defects', data);
}

export function deleteDefect(defectId: number) {
  return del(`/api/v1/inspection/defects/${defectId}`);
}

/* ════════════════════════════════════════
   使用决策
   ════════════════════════════════════════ */

export function getDecisions(materialId: number) {
  return fetchJson<{ success: boolean; data: unknown | unknown[] }>(`/api/v1/inspection/materials/${materialId}/decision`);
}

export function addDecision(data: {
  material_id: number;
  status: string;
  quantity: number;
  decision: string;
  defective_handling: boolean;
  mrb_review: boolean;
}) {
  return postJson<{ success: boolean; data: unknown }>('/api/v1/inspection/decisions', data);
}

export function updateDecision(decisionId: number, data: Record<string, unknown>) {
  return putJson<{ success: boolean; data: unknown }>(`/api/v1/inspection/decisions/${decisionId}`, data);
}

export function deleteDecision(decisionId: number) {
  return del(`/api/v1/inspection/decisions/${decisionId}`);
}
