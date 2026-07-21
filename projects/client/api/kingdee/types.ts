/**
 * 金蝶云星空 WebAPI 类型定义
 * 字段映射严格遵循《平板端MES检验单系统产品需求文档》
 */

/* ════════════════════════════════════════
   通用响应
   ════════════════════════════════════════ */

export interface KingdeeResponseStatus {
  IsSuccess: boolean;
  ErrorCode: string;
  Errors: { FieldName: string; Message: string; DIndex: number }[];
  SuccessEntitys: { Id: string; Number: string; DIndex: number }[];
  SuccessMessages: { FieldName: string; Message: string; DIndex: number }[];
  MsgCode: number; // 1=会话丢失，需重新登录
}

export interface KingdeeLoginResult {
  LoginResultType: number;
  // -7 激活, -6 未绑定, -5 需表单处理, -4 警告, -3 密码不通过(强制), -2 密码不通过(可选),
  // -1 失败, 0 用户名或密码错误, 1 成功
  Message?: string;
  KDSVCSessionId?: string;
}

/* ════════════════════════════════════════
   金蝶基础资料通用格式（View API 返回）
   ════════════════════════════════════════ */

/** 金蝶基础资料对象（View API 标准格式） */
export interface KdBaseData {
  Id?: number;
  Number?: string;
  Name?: string;
}

/** 兼容 BillQuery 的旧格式 { FNumber: string } 以及 Save 接口要求的 { FNUMBER: string } */
export interface KdBaseDataLegacy {
  FNumber?: string;
  FNUMBER?: string;
  FName?: string;
}

/** 统一的基础资料类型 */
export type KdBaseDataUnion = KdBaseData | KdBaseDataLegacy;

/* ════════════════════════════════════════
   检验单主表 (T_QM_INSPECTBILL)
   兼容 BillQuery（全大写）和 View API（驼峰）字段名
   ════════════════════════════════════════ */

export interface InspectBill {
  FID: string; // 单据内码
  FBILLNO?: string; // BillQuery 用大写
  FBillNo?: string; // View API 用驼峰
  FDate?: string; // 单据日期
  // 单据类型：兼容 { FNumber } 和 { Id, Number, Name }
  FBILLTYPEID?: KdBaseDataUnion;
  FBillTypeID?: KdBaseDataUnion;
  FDocumentStatus?: string; // 单据状态 (Z 创建, A 审核中, B 已审核, C 重新审核)
  FBillStatus?: string; // 单据状态标识
  FInspectedQty?: number; // 已检数量
  // 检验结果（View API 返回基础资料格式）
  FInspectResult?: KdBaseDataUnion;
  // 表体分录
  FEntity?: InspectBillEntry[];
  /** 检验项目明细（子单据体），实际金蝶字段标识为 FItemDetail */
  FItemDetail?: InspectItemDetail[];
  /** 兼容旧字段名 */
  F_QM_IBITEMDETAIL?: InspectItemDetail[];
  /** 缺陷记录明细（子单据体） */
  F_QM_IBDEFECTDETAIL?: DefectDetail[];
  /** 使用决策明细（子单据体） */
  F_QM_IBPOLICYDETAIL?: PolicyDetail[];
}

/* ════════════════════════════════════════
   检验单表体 (T_QM_INSPECTBILLENTRY)
   兼容 BillQuery（全大写）和 View API（驼峰）字段名
   ════════════════════════════════════════ */

export interface InspectBillEntry {
  FEntryID?: string; // 分录内码（BillQuery 格式）
  FEntryId?: string; // 分录内码（View API 驼峰）
  FSEQ?: number; // 行号
  // 物料编码：兼容两种字段名和两种基础资料格式
  FMATERIALID?: KdBaseDataUnion;
  FMaterialID?: KdBaseDataUnion;
  FMaterialName?: string; // 物料名称（关联携带）
  FMaterialModel?: string; // 规格型号
  // 质检方案：兼容两种字段名和两种基础资料格式
  FQCSchemeId?: KdBaseDataUnion;
  FQCSCHEMEID?: KdBaseDataUnion;
  // 单位：兼容两种字段名和两种基础资料格式
  FUnitID?: KdBaseDataUnion;
  FUNITID?: KdBaseDataUnion;
  FINSPECTQTY?: number; // 检验数量（送检数量）
  FInspectQty?: number; // View API 驼峰格式
  FQualifiedQty?: number; // 合格数量（View API）
  FUnQualifiedQty?: number; // 不合格数量（View API）
  // 使用决策字段
  FPolicyStatus?: string; // 状态
  FPolicyQty?: number; // 数量
  FUSEPOLICY?: string; // 使用决策
  FISDEFECTPROCESS?: boolean; // 不良处理
  FISMRBREVIEW?: boolean; // MRB评审
  // 检验项目明细（子单据体），实际金蝶字段标识为 FItemDetail
  FItemDetail?: InspectItemDetail[];
}

/* ════════════════════════════════════════
   检验项目表体 (T_QM_IBITEMDETAIL)
   兼容两种基础资料格式
   ════════════════════════════════════════ */

export interface InspectItemDetail {
  FDetailID?: string; // 明细内码
  // 检验项目（基础资料）：兼容两种字段名和两种格式
  FInspectItemId?: KdBaseDataUnion;
  FInspectItemID?: KdBaseDataUnion;
  FInspectItemName?: string; // 检验项目名称
  FTargetVal?: string; // 目标值
  FInspectVal?: string; // 检测值（旧字段，兼容保留）
  /** 定量分析检验值 */
  FInspectValQ?: number;
  /** 定性分析检验值（基础资料格式，金蝶要求键名为 FNUMBER 全大写） */
  FInspectValB?: { FNUMBER: string };
  /** 其他分析检验值 */
  FInspectValT?: string;
  FInspectResult1?: string; // 判定结果（合格/不合格/待检，APP自动判定后回传）
  FUpperLimit?: number; // 上限（用于APP判定逻辑）
  FLowerLimit?: number; // 下限（用于APP判定逻辑）
  FAnalysisMethod?: string; // 分析方法（定量/定性/其他）
  FDefectLevel?: string; // 缺陷等级
  FInspectStandard?: string; // 检验标准
}

/* ════════════════════════════════════════
   使用决策表体 (T_QM_IBPOLICYDETAIL)
   兼容两种基础资料格式
   ════════════════════════════════════════ */

export interface PolicyDetail {
  FDetailID?: string; // 明细内码
  FPolicyStatus?: string | KdBaseDataUnion; // 状态
  FPolicyQty?: number; // 数量
  FUSEPOLICY?: string | KdBaseDataUnion; // 使用决策
  FISDEFECTPROCESS?: boolean; // 不良处理
  FISMRBREVIEW?: boolean; // MRB评审
}

/* ════════════════════════════════════════
   缺陷记录表体 (T_QM_IBDEFECTDETAIL)
   兼容两种基础资料格式
   ════════════════════════════════════════ */

export interface DefectDetail {
  FDetailID?: string; // 明细内码
  // 缺陷类型（基础资料）：兼容两种格式
  FDefectTypeId?: KdBaseDataUnion;
  FDefectTypeID?: KdBaseDataUnion;
  FDefectQty: number; // 缺陷数量（不良样本数）
  // 缺陷原因（基础资料）：兼容两种格式
  FDefectReasonId?: KdBaseDataUnion;
  FDefectReasonID?: KdBaseDataUnion;
  FDefectLevel: string; // 缺陷等级（致命缺陷/重缺陷/轻缺陷）
  // 缺陷后果（基础资料）：兼容两种格式
  FDefectResultId?: KdBaseDataUnion;
  FDefectResultID?: KdBaseDataUnion;
  FDefectMemo?: string; // 缺陷详细描述/备注
}

/* ════════════════════════════════════════
   本地业务模型（供UI层使用）
   ════════════════════════════════════════ */

export interface OrderSummary {
  id: string;
  order_no: string;
  type: string; // 检验类型名称（UI 展示用）
  type_id: string; // 检验类型编码
  type_name?: string; // 金蝶返回的中文单据类型名称
  status: string; // 本地状态映射
  document_status: string; // 金蝶原始单据状态
  date: string;
  supplier?: string;
  // 分录物料信息（BillQuery 分录字段）
  material_code?: string;
  material_name?: string;
  material_count?: number; // 单据体分录（物料）总数，用于列表页展示"等N种"
  // 组织信息（View API）
  inspect_org_name?: string;
  source_org_name?: string;
  // 创建人/质检人（View API 返回基础资料格式）
  creator_name?: string;
  creator_number?: string;
  // 审核人
  approver_name?: string;
  approver_number?: string;
  // 创建日期
  create_date?: string;
  // 审核日期
  approve_date?: string;
}

export interface MaterialInfo {
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

export interface DecisionInfo {
  detail_id?: string;
  policy_status?: string;
  policy_qty?: number;
  use_policy?: string;
  is_defect_process?: boolean;
  is_mrb_review?: boolean;
}

export interface ItemInfo {
  detail_id?: string;
  item_id: string;
  item_name?: string;
  target_val?: string;
  inspect_val?: string;
  result?: string; // 合格/不合格/待检
  upper_limit?: number;
  lower_limit?: number;
  analysis_method?: string;
  defect_level?: string;
  inspect_standard?: string;
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

export interface DefectInfo {
  detail_id?: string;
  defect_type: string;
  defect_qty: number;
  defect_reason?: string;
  defect_level: string;
  defect_result?: string;
  defect_memo?: string;
}
