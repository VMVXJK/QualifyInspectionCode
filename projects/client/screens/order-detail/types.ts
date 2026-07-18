/**
 * 检验单详情页本地类型定义
 * UI 层与 API 层之间的数据契约
 */

export interface LocalOrder {
  id: string;
  order_no: string;
  type: string;
  type_id: string;
  date: string;
  status: string;
  document_status: string;
  creator_name?: string;
  creator_number?: string;
  approver_name?: string;
  approver_number?: string;
  create_date?: string;
  approve_date?: string;
  // 组织信息
  inspect_org_name?: string;
  source_org_name?: string;
}

export interface LocalMaterial {
  entry_id: string;
  material_code: string;
  material_name: string;
  material_model?: string;
  unit: string;
  inspect_qty: number;
  qualified_qty?: number;
  unqualified_qty?: number;
  inspect_result?: string;
  /** 质检方案编码 */
  qc_scheme_code?: string;
  /** 质检方案名称 */
  qc_scheme_name?: string;
}

export interface LocalDecision {
  detail_id?: string;
  policy_status?: string;
  policy_qty?: number;
  use_policy?: string;
  is_defect_process?: boolean;
  is_mrb_review?: boolean;
}

export interface LocalItem {
  detail_id?: string;
  item_id: string;
  item_name: string;
  target_val?: string;
  inspect_val?: string;
  result?: string;
  upper_limit?: number;
  lower_limit?: number;
  analysis_method?: string;
  defect_level?: string;
  inspect_standard?: string;
  /** 定性检验值选项列表（仅当 analysis_method === '定性' 时有值） */
  qualitative_options?: Array<{ code: string; text: string }>;
  // 新增字段
  /** 检验项目里的检验结果（FInspectResult1） */
  inspect_result1?: string;
  /** 检验方法名称 */
  inspect_method_name?: string;
  /** 检验仪器名称 */
  inspect_instrument_name?: string;
  /** 检验项目里的缺陷等级（FDefectLevel1） */
  defect_level1?: string;
  /** 检验方法编码（回传 Save 接口用，非仅展示） */
  method_code?: string;
  /** 检验仪器编码（回传 Save 接口用，非仅展示） */
  instrument_code?: string;
  /** 质量标准编码（回传 Save 接口用，非仅展示） */
  quality_std_code?: string;
}

export interface LocalDefect {
  detail_id?: string;
  defect_type: string;
  defect_qty: number;
  defect_reason?: string;
  defect_level: string;
  defect_result?: string;
}

/** 保存诊断信息 */
export interface SaveDiagnostics {
  request: unknown;
  response: unknown;
  error?: string;
  status?: import('@/api/kingdee/types').KingdeeResponseStatus;
  fEntityDiagnostics?: unknown;
}
