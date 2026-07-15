/**
 * 质检模块核心业务类型定义
 */

export interface InspectionOrder {
  id: number;
  order_no: string;
  type: string;
  supplier: string;
  create_date: string;
  status: string;
  priority: string;
  remarks?: string;
}

export interface Material {
  id: number;
  order_id: number;
  material_code: string;
  material_name: string;
  quantity: number;
  sample_size: number;
  inspection_result: string;
  overall_verdict?: string;
  remarks?: string;
}

export interface InspectionItem {
  id: number;
  material_id: number;
  item_name: string;
  standard_value?: string;
  upper_limit?: number;
  lower_limit?: number;
  unit?: string;
  test_value?: string;
  is_qualified?: string;
  remarks?: string;
}

export interface Defect {
  id: number;
  material_id: number;
  defect_type: string;
  defect_count: number;
  defect_reason?: string;
  severity: string;
  created_at: string;
}

export interface Decision {
  id: number;
  material_id: number;
  status: '合格' | '不合格';
  quantity: number;
  decision: '接收' | '让步接收' | '挑选(全检)' | '判退';
  defective_handling: boolean;
  mrb_review: boolean;
  created_at: string;
}
