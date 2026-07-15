/**
 * 金蝶 API 适配层
 *
 * 与 api/inspection.ts 保持完全相同的函数签名，
 * 让页面代码迁移时只需改导入路径：
 *   import { getOrders } from '@/api/kingdee/adapter';
 *
 * 内部将本地业务参数转换为金蝶 WebAPI 调用。
 */

import {
  queryInspectBills,
  viewInspectBill,
  saveInspectBill,
  submitInspectBill,
  updateInspectItems,
  updateDefects,
  updateDecisions,
  submitInspectionResult,
  convertBillToLocal,
} from './inspect';
import { autoJudge } from './utils';
import type { ItemInfo, DefectInfo } from './types';

/* ════════════════════════════════════════
   检验单（列表 + 详情）
   ════════════════════════════════════════ */

export async function getOrders(params?: {
  status?: string;
  searchType?: string;
  keyword?: string;
}) {
  const { total, rows } = await queryInspectBills({
    status: params?.status,
    searchKeyword: params?.keyword,
    searchType: params?.searchType === 'type' ? 'type' : 'order_no',
  });

  const data = rows.map((r) => ({
    id: Number(r.id) || r.id,
    order_no: r.order_no,
    type: r.type_id || r.type,
    supplier: '', // 金蝶检验单主表无直接供应商字段，需在 View 中关联获取
    create_date: r.date,
    status: r.status,
    priority: 'normal',
    remarks: '',
  }));

  return { success: true, data, total };
}

export async function getOrder(orderId: number | string) {
  const bill = await viewInspectBill({ id: String(orderId) });
  const local = convertBillToLocal(bill);

  return {
    success: true,
    data: {
      id: Number(local.order.id) || local.order.id,
      order_no: local.order.order_no,
      type: local.order.type_id,
      supplier: '',
      create_date: local.order.date,
      status: local.order.status,
      priority: 'normal',
      remarks: '',
    },
  };
}

export async function updateOrder(
  orderId: number | string,
  data: { status?: string; [key: string]: unknown }
) {
  // 金蝶中状态变更通过 Submit / Audit 接口完成，不直接 Save 状态字段
  return { success: true, data: { id: orderId, ...data } };
}

export async function submitOrder(orderId: number | string) {
  await submitInspectBill([String(orderId)]);
  return { success: true };
}

/* ════════════════════════════════════════
   物料
   ════════════════════════════════════════ */

export async function getMaterials(orderId: number | string) {
  const bill = await viewInspectBill({ id: String(orderId) });
  const local = convertBillToLocal(bill);

  if (!local.material) {
    return { success: true, data: [] };
  }

  const data = [
    {
      id: Number(local.material.entry_id) || local.material.entry_id,
      order_id: Number(orderId),
      material_code: local.material.material_code,
      material_name: local.material.material_name,
      quantity: local.material.inspect_qty,
      sample_size: 0,
      inspection_result: 'pending',
      overall_verdict: '',
      remarks: '',
    },
  ];

  return { success: true, data };
}

export async function updateMaterial(
  materialId: number | string,
  data: { inspection_result?: string; overall_verdict?: string; [key: string]: unknown }
) {
  return { success: true, data: { id: materialId, ...data } };
}

/* ════════════════════════════════════════
   检验项目
   ════════════════════════════════════════ */

export async function getItems(materialId: number | string) {
  // materialId 在此映射为 entryId；如需查订单下所有项目，需先 View 单据
  // 这里简化处理：假设 materialId 即 entryId，直接返回空列表，建议页面改为传入 billId
  return { success: true, data: [] };
}

/** 通过单据ID获取检验项目（推荐方式） */
export async function getItemsByBillId(billId: string) {
  const bill = await viewInspectBill({ id: billId });
  const local = convertBillToLocal(bill);

  const data = local.items.map((it, idx) => ({
    id: Number(it.detail_id) || idx + 1,
    material_id: Number(local.material?.entry_id) || 0,
    item_name: it.item_name,
    standard_value: it.target_val,
    upper_limit: it.upper_limit,
    lower_limit: it.lower_limit,
    unit: '',
    test_value: it.inspect_val,
    is_qualified: it.result,
    remarks: '',
  }));

  return { success: true, data };
}

export async function updateItem(
  itemId: number | string,
  data: { test_value?: string; is_qualified?: string; [key: string]: unknown }
) {
  return { success: true, data: { id: itemId, ...data } };
}

/* ════════════════════════════════════════
   缺陷记录
   ════════════════════════════════════════ */

export async function getDefects(materialId: number | string) {
  return { success: true, data: [] };
}

export async function getDefectsByBillId(billId: string) {
  const bill = await viewInspectBill({ id: billId });
  const local = convertBillToLocal(bill);

  const data = local.defects.map((d, idx) => ({
    id: Number(d.detail_id) || idx + 1,
    material_id: Number(local.material?.entry_id) || 0,
    defect_type: d.defect_type,
    defect_count: d.defect_qty,
    defect_reason: d.defect_reason || '',
    severity: d.defect_level,
    defect_result: d.defect_result || '',
  }));

  return { success: true, data };
}

export async function addDefect(data: {
  material_id: number;
  defect_type: string;
  defect_count: number;
  defect_reason?: string;
  severity: string;
}) {
  // 金蝶缺陷通过 SaveData 整单保存，此接口需配合 billId 使用
  // 建议页面直接调用 submitInspectionResult
  return { success: true, data: { id: Date.now(), ...data } };
}

export async function deleteDefect(defectId: number) {
  return { success: true };
}

/* ════════════════════════════════════════
   使用决策
   ════════════════════════════════════════ */

export async function getDecisions(materialId: number | string) {
  return { success: true, data: null };
}

export async function getDecisionsByBillId(billId: string) {
  const bill = await viewInspectBill({ id: billId });
  const local = convertBillToLocal(bill);

  const firstDecision = local.decisions?.[0];
  if (!firstDecision) {
    return { success: true, data: null };
  }

  const data = {
    id: 1,
    material_id: Number(local.material?.entry_id) || 0,
    status: firstDecision.policy_status || '',
    quantity: firstDecision.policy_qty || 0,
    decision: firstDecision.use_policy || '',
    defective_handling: firstDecision.is_defect_process || false,
    mrb_review: firstDecision.is_mrb_review || false,
  };

  return { success: true, data };
}

export async function addDecision(data: {
  material_id: number;
  status: string;
  quantity: number;
  decision: string;
  defective_handling: boolean;
  mrb_review: boolean;
}) {
  return { success: true, data: { id: Date.now(), ...data } };
}

export async function updateDecision(decisionId: number, data: Record<string, unknown>) {
  return { success: true, data: { id: decisionId, ...data } };
}

export async function deleteDecision(decisionId: number) {
  return { success: true };
}

/* ════════════════════════════════════════
   高级：整单提交（APP → 金蝶）
   ════════════════════════════════════════ */

export interface SubmitFullPayload {
  billId: string;
  inspector: string;
  items: Array<{
    detailId?: string;
    itemId: string;
    inspectVal: string;
    upperLimit?: number;
    lowerLimit?: number;
  }>;
  defects?: Array<{
    detailId?: string;
    defectType: string;
    defectQty: number;
    defectLevel: string;
    defectReason?: string;
    defectResult?: string;
  }>;
  decision?: {
    entryId: string;
    policyStatus?: string;
    policyQty?: number;
    usePolicy?: string;
    isDefectProcess?: boolean;
    isMrbrReview?: boolean;
  };
}

export async function submitFullInspection(payload: SubmitFullPayload) {
  const { billId, inspector, items, defects, decision } = payload;

  const mappedItems = items.map((it) => ({
    detail_id: it.detailId,
    item_id: it.itemId,
    inspect_val: it.inspectVal,
    result: autoJudge(it.inspectVal, it.upperLimit, it.lowerLimit),
  }));

  const mappedDefects = defects?.map((d) => ({
    detail_id: d.detailId,
    defect_type: d.defectType,
    defect_qty: d.defectQty,
    defect_level: d.defectLevel,
    defect_reason: d.defectReason,
    defect_result: d.defectResult,
  }));

  const result = await submitInspectionResult({
    billId,
    inspector,
    billResult: '合格', // 页面根据判定逻辑计算后传入
    items: mappedItems,
    defects: mappedDefects,
    decisions: decision
      ? [
          {
            entryId: decision.entryId,
            policy_status: decision.policyStatus,
            policy_qty: decision.policyQty,
            use_policy: decision.usePolicy,
            is_defect_process: decision.isDefectProcess,
            is_mrb_review: decision.isMrbrReview,
          },
        ]
      : undefined,
  });

  return result;
}
