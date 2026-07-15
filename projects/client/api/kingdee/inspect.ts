/**
 * 检验单业务 API 封装（对接金蝶云星空 QM_InspectBill）
 *
 * 覆盖：
 * - 查询待检列表（BillQuery）
 * - 查看检验单详情（View）
 * - 保存/更新检验结果（Save / SaveData）
 * - 提交单据（Submit）
 * - 审核单据（Audit）
 *
 * 字段映射严格依据《平板端MES检验单系统产品需求文档》
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { callKingdee, callKingdeePost, callKingdeeSingle } from './client';
import {
  mapDocumentStatus,
  autoJudge,
  formatKdDate,
  toKdJson,
  resolveBaseData,
  resolveString,
  resolveNumber,
} from './utils';
import type {
  InspectBill,
  InspectBillEntry,
  InspectItemDetail,
  DefectDetail,
  BillQueryParam,
  ViewParam,
  SaveParam,
  SubmitParam,
  AuditParam,
  OrderSummary,
  MaterialInfo,
  DecisionInfo,
  ItemInfo,
  DefectInfo,
  KingdeeResponseStatus,
} from './types';

const FORM_ID = 'QM_InspectBill';

/* ════════════════════════════════════════
   1. 查询待检列表（BillQuery）
   ════════════════════════════════════════ */

/** 默认查询字段（列表展示用）
 *
 * 字段说明（严格对应金蝶 QM_InspectBill 元数据）：
 * - FID                单据内码
 * - FBILLNO            单据编号
 * - FDate              单据日期
 * - FBILLTYPEID.FNumber 单据类型编码（基础资料取编码，避免返回对象）
 * - FDocumentStatus    单据状态 (Z=创建, A=审核中, B=已审核, C=重新审核)
 *
 * 注意：
 * 1. BillQuery 返回的是对象数组 [{ FID: ..., FBILLNO: ... }, ...]，
 *    键名与 FieldKeys 完全一致（包括带点号的复合字段）。
 * 2. 基础资料字段不要超过 30 个（含多语言字段），当前 5 个字段安全。
 * 3. 查询一定要有查询条件并限定取数范围，防止接口超时。
 */
const LIST_FIELD_KEYS = [
  'FID',
  'FBILLNO',
  'FDate',
  'FBILLTYPEID.FNumber',
  'FBILLTYPEID.FName',
  'FDocumentStatus',
].join(',');

/**
 * 拉取检验单列表（BillQuery）
 *
 * 接口地址：.../DynamicFormService.BillQuery.common.kdsvc
 * 请求格式：{ data: { FormId, FieldKeys, FilterString, OrderString, StartRow, Limit } }
 * 正常返回：[{ FID: ..., FBILLNO: ..., ... }, ...]  // 对象数组
 * 异常返回：{ ResponseStatus: { IsSuccess: false, Errors: [...] } }
 *
 * @param params 分页与过滤参数
 * @returns total 为当前页条数（BillQuery 不返回总记录数）
 */
export async function queryInspectBills(params?: {
  status?: string; // pending / inspecting / completed / all
  searchKeyword?: string;
  searchType?: 'order_no' | 'type';
  startRow?: number;
  limit?: number;
  topRowCount?: number; // 最多允许查询的数量，0或不传表示不限制
  /** 默认日期范围过滤（天），防止无条件查询导致全表扫描超时。默认90天 */
  dateRangeDays?: number;
}): Promise<{ total: number; rows: OrderSummary[] }> {
  const filters: string[] = [];

  // 状态过滤（金蝶单据状态：Z=创建, A=审核中, B=已审核, C=重新审核）
  if (params?.status && params.status !== 'all') {
    const kdStatus = mapKdStatusForQuery(params.status);
    if (kdStatus) {
      filters.push(kdStatus);
    }
  }

  // 关键字搜索（对输入做简单转义，避免破坏 FilterString 语法）
  if (params?.searchKeyword?.trim()) {
    const kw = escapeFilterValue(params.searchKeyword.trim());
    if (params.searchType === 'type') {
      filters.push(`FBILLTYPEID.FNumber like '%${kw}%'`);
    } else {
      filters.push(`FBILLNO like '%${kw}%'`);
    }
  }

  // 默认日期范围过滤：防止无查询条件时全表扫描导致接口超时
  // 金蝶 FilterString 中日期格式通常为 'yyyy-MM-dd'
  const dateRange = params?.dateRangeDays ?? 90;
  if (dateRange > 0) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - dateRange);
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    filters.push(`FDate >= '${fmt(start)}' and FDate <= '${fmt(end)}'`);
  }

  const filterString = filters.join(' and ');

  // 根据实测，BillQuery 接口请求体为 { data: {...} } 对象格式，
  // 字段顺序与 FieldKeys 一一对应，返回值同理为对象数组。
  // 注意：仅传入图片中实测存在的字段，避免多余字段导致服务端异常。
  const requestBody = {
    data: {
      FormId: FORM_ID,
      FieldKeys: LIST_FIELD_KEYS,
      FilterString: filterString,
      OrderString: ' FDate DESC ',
      StartRow: 0,
      Limit: 50,
    },
  };

  let result: unknown;
  try {
    result = await callKingdeePost<unknown>('BillQuery', requestBody);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '查询检验单请求失败';
    try {
      await AsyncStorage.setItem(
        '__debug_last_kingdee_response',
        JSON.stringify({
          timestamp: new Date().toISOString(),
          service: 'BillQuery',
          stage: 'request',
          requestBody,
          error: msg,
        })
      );
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }

  /**
   * 统一将可能的对象数组或二维数组转换为标准二维数组
   *
   * 实测 BillQuery 返回格式为对象数组：
   * [{ FID: 100051, FBILLNO: "IQC000010", FDate: "...", "FBILLTYPEID.FNumber": "...", FDocumentStatus: "A" }, ...]
   *
   * 同时也兼容旧版二维数组格式：[[100051, "IQC000010", ...], ...]
   * 以及 { Result: [...] } / { data: [...] } 等包装格式。
   */
  function normalizeRows(raw: unknown): unknown[] {
    let arr: unknown[] = [];

    if (Array.isArray(raw)) {
      arr = raw;
    } else if (raw && typeof raw === 'object') {
      const obj = raw as Record<string, unknown>;

      // 尝试提取嵌套数组：Result / data / response / Response
      const nestedArr =
        ('Result' in obj && Array.isArray(obj.Result)) ? obj.Result :
        ('data' in obj && Array.isArray(obj.data)) ? obj.data :
        ('response' in obj && Array.isArray(obj.response)) ? obj.response :
        ('Response' in obj && Array.isArray(obj.Response)) ? obj.Response :
        undefined;

      if (nestedArr !== undefined) {
        arr = nestedArr;
      } else if (
        ('Result' in obj && (obj.Result === null || obj.Result === undefined)) ||
        ('data' in obj && (obj.data === null || obj.data === undefined))
      ) {
        arr = [];
      } else {
        // 尝试提取错误信息（多层嵌套兼容）
        const extractRs = (o: Record<string, unknown>) =>
          'ResponseStatus' in o ? (o.ResponseStatus as Record<string, unknown>) : undefined;
        const rs = extractRs(obj) ??
          ('Result' in obj && typeof obj.Result === 'object' && obj.Result !== null)
            ? extractRs(obj.Result as Record<string, unknown>)
            : undefined;

        if (rs) {
          if (rs.IsSuccess === false || rs.IsSuccess === 'false') {
            const errs = rs.Errors as Array<{ Message?: string }> | undefined;
            const firstMsg = errs?.[0]?.Message;
            if (firstMsg) throw new Error(firstMsg);
          }
          if ('Message' in rs && typeof rs.Message === 'string') {
            throw new Error(rs.Message);
          }
        }
        if ('Message' in obj && typeof obj.Message === 'string') {
          throw new Error(obj.Message);
        }
        throw new Error('查询检验单失败：返回格式异常（无法识别数据数组）');
      }
    } else {
      throw new Error('查询检验单失败：返回格式异常');
    }

    if (arr.length === 0) return [];

    // 如果第一个元素是对象（且不是数组），则是对象数组格式
    const first = arr[0];
    if (first && typeof first === 'object' && !Array.isArray(first)) {
      // 对象数组 → 二维数组（按 FieldKeys 顺序提取）
      const keys = LIST_FIELD_KEYS.split(',');
      return arr.map((item) => {
        const record = item as Record<string, unknown>;
        return keys.map((k) => record[k]);
      });
    }

    // 否则视为二维数组，直接返回
    return arr;
  }

  let rowsRaw: unknown[];
  try {
    rowsRaw = normalizeRows(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '查询检验单失败：返回格式异常';
    try {
      await AsyncStorage.setItem(
        '__debug_last_kingdee_response',
        JSON.stringify({
          timestamp: new Date().toISOString(),
          service: 'BillQuery',
          stage: 'normalizeRows',
          requestBody,
          rawResult: result,
          error: msg,
        })
      );
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }

  // 解析二维数组 → OrderSummary
  const rows: OrderSummary[] = rowsRaw!.map((row, idx) => {
    if (!Array.isArray(row)) {
      throw new Error(`查询检验单失败：第 ${idx} 行格式异常（非数组）`);
    }
    const typeId = String(row[3] ?? '');
    const typeNameFromKd = String(row[4] ?? '');
    return {
      id: String(row[0] ?? ''),
      order_no: String(row[1] ?? ''),
      date: String(row[2] ?? ''),
      type_id: typeId,
      type_name: typeNameFromKd || mapBillTypeName(typeId),
      document_status: String(row[5] ?? ''),
      status: mapDocumentStatus(String(row[5] ?? '')),
      type: typeNameFromKd || mapBillTypeName(typeId),
    };
  });

  return { total: rows.length, rows };
}

/**
 * 从金蝶 View 接口返回结果中提取业务数据
 * 兼容：{ Result: { Result: T } } 以及直接返回对象等格式
 */
function extractViewResult<T>(raw: unknown): T {
  if (!raw || typeof raw !== 'object') {
    throw new Error('查询详情失败：返回格式异常');
  }
  const obj = raw as Record<string, unknown>;

  // 检查错误信息（顶层或 Result 内嵌套）
  const rs =
    'ResponseStatus' in obj
      ? (obj.ResponseStatus as Record<string, unknown>)
      : undefined;
  if (rs) {
    if (rs.IsSuccess === false || rs.IsSuccess === 'false') {
      const errs = rs.Errors as Array<{ Message?: string }> | undefined;
      const firstMsg = errs?.[0]?.Message;
      if (firstMsg) throw new Error(firstMsg);
    }
    if ('Message' in rs && typeof rs.Message === 'string') {
      throw new Error(rs.Message);
    }
  }

  // 提取数据：优先 Result.Result，其次 Result，再次顶层对象本身
  let data: unknown;
  if ('Result' in obj && obj.Result && typeof obj.Result === 'object') {
    const resultObj = obj.Result as Record<string, unknown>;
    if ('Result' in resultObj) {
      data = resultObj.Result;
    } else {
      data = obj.Result;
    }
  } else if ('Result' in obj) {
    data = obj.Result;
  } else {
    data = obj;
  }

  // 防御性检查：确保数据不是 null/undefined/数组/字符串
  if (data === null || data === undefined) {
    throw new Error('查询详情失败：返回数据为空（Result.Result 为 null/undefined）');
  }
  if (Array.isArray(data)) {
    throw new Error('查询详情失败：返回数据为数组而非对象');
  }
  if (typeof data !== 'object') {
    throw new Error(`查询详情失败：返回数据格式异常（类型: ${typeof data}）`);
  }

  return data as T;
}

/** 查看检验单完整详情（View 接口）
 *
 * 请求体格式：{ data: { FormId, CreateOrgId, Number, ID, IsSortBySeq } }
 * 其中 CreateOrgId 和 Number 即使为空也需显式传入。
 */
export async function viewInspectBill(
  identifier: { id?: string; number?: string },
  orgId?: number
): Promise<InspectBill> {
  if (!identifier.id && !identifier.number) {
    throw new Error('查看检验单详情时必须提供 ID 或 Number');
  }

  const requestBody = {
    formid: FORM_ID,
    data: {
      CreateOrgId: orgId ?? 0,
      Number: identifier.number ?? '',
      Id: identifier.id ?? '',
      IsSortBySeq: 'false',
    },
  };

  const result = await callKingdeePost<unknown>('View', requestBody);
  return extractViewResult<InspectBill>(result);
}

/**
 * 通用查看表单数据（View 接口）
 * @param formId  金蝶表单标识，如 "QM_InspectBill"、"BD_MATERIAL" 等
 * @param query   查询条件：Id（内码）或 Number（编码）至少填一个
 * @param orgId   创建组织Id（可选）
 * @returns 金蝶返回的原始 Result 数据
 */
export async function viewForm<T = unknown>(
  formId: string,
  query: { id?: string; number?: string },
  orgId?: number
): Promise<T> {
  if (!query.id && !query.number) {
    throw new Error('查询表单详情时必须提供 ID 或 Number');
  }

  const requestBody = {
    formid: formId,
    data: {
      CreateOrgId: orgId ?? 0,
      Number: query.number ?? '',
      ID: query.id ?? '',
      IsSortBySeq: 'false',
    },
  };

  const result = await callKingdeePost<unknown>('View', requestBody);
  return extractViewResult<T>(result);
}

/* ════════════════════════════════════════
   Save 接口字段格式化工具函数
   ════════════════════════════════════════ */

/** 将布尔值转为金蝶要求的字符串格式："true" / "false" */
function formatKdBoolean(val: boolean | string | undefined): string {
  if (typeof val === 'string') return val === 'true' ? 'true' : 'false';
  return val === true ? 'true' : 'false';
}

/** 将日期转为金蝶要求的 YYYY-MM-DD 格式 */
function formatKdDateStr(val: string | Date | undefined): string {
  if (!val) return '1900-01-01';
  const d = typeof val === 'string' ? new Date(val.replace(/\//g, '-')) : val;
  if (isNaN(d.getTime())) return '1900-01-01';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 判断基础资料字段应使用 FNumber 还是 FNUMBER */
function shouldUseFNumber(fieldName: string): boolean {
  const fNumberFields = [
    'FBaseUnitId', 'FUnitID', 'FKeeperId', 'FLot', 'FOwnerId',
    'FPrdUnitId', 'FSNUnitID', 'FStockId', 'FInspectDepId',
    'FInspectOrgId', 'FValueUnitID',
  ];
  return fNumberFields.includes(fieldName);
}

/** 判断字段名是否为基础资料字段（支持带F前缀和不带F前缀） */
function isBaseDataFieldName(fieldName: string): boolean {
  const patterns = [
    /^(F)?BillTypeID$/i, /^(F)?BFLowId$/i, /^(F)?BomId$/i, /^(F)?Currency$/i,
    /^(F)?CustomerId$/i, /^(F)?BaseUnitId$/i, /^(F)?MaterialId$/i, /^(F)?KeeperId$/i,
    /^(F)?Lot$/i, /^(F)?OwnerId$/i, /^(F)?PrdUnitId$/i, /^(F)?ProductLineId$/i,
    /^(F)?QCSchemeId$/i, /^(F)?SampleSchemeId\d*$/i, /^(F)?SNUnitID$/i,
    /^(F)?StockGroupId$/i, /^(F)?StockId$/i, /^(F)?StockerId$/i, /^(F)?SupplierId$/i,
    /^(F)?WorkshopId$/i, /^(F)?UnitID$/i, /^(F)?InspectDepId$/i, /^(F)?InspectOrgId$/i,
    /^(F)?InspectorId$/i, /^(F)?SourceOrgId$/i, /^(F)?InspectItemId$/i,
    /^(F)?InspectBasisId$/i, /^(F)?InspectInstrumentId$/i, /^(F)?InspectMethodId$/i,
    /^(F)?QualityStdId$/i, /^(F)?UnitId\d*$/i, /^(F)?DefectTypeId$/i,
    /^(F)?DefectReasonId$/i, /^(F)?DefectResultId$/i, /^(F)?DSerialId$/i,
    /^(F)?InspectValB$/i, /^(F)?DownLimitB$/i, /^(F)?DownOffsetB$/i,
    /^(F)?TargetValB$/i, /^(F)?UpLimitB$/i, /^(F)?UpOffsetB$/i,
    /^(F)?InspectValueB$/i, /^(F)?VSerialId$/i, /^(F)?ValueUnitID$/i,
    /^(F)?PolicyMaterialId$/i, /^(F)?SerialId$/i, /^(F)?StockLocId$/i,
    /^(F)?PrdLineLocation$/i, /^(F)?OrderType$/i,
  ];
  return patterns.some((p) => p.test(fieldName));
}

/** 获取空基础资料字典（根据字段名返回正确的空对象格式） */
function getEmptyBaseData(fieldName: string): object {
  if (/^(F)?StockLocId$/i.test(fieldName)) return {};
  if (/^(F)?BFLowId$/i.test(fieldName)) return { FNAME: '' };
  if (/^(F)?PrdLineLocation$/i.test(fieldName)) return { FLOCATIONCODE: '' };
  if (/^(F)?OrderType$/i.test(fieldName)) return { FID: '' };
  if (shouldUseFNumber(fieldName)) return { FNumber: '' };
  return { FNUMBER: '' };
}

/** 将基础资料对象转为金蝶 Save 接口要求的格式
 * 支持：空值、字符串、对象（{Id,Number,Name} / {FNumber} / {FNUMBER}）
 */
function formatKdBaseData(val: unknown, fieldName: string): object {
  // 空值/0 → 返回对应的空字典
  if (val === null || val === undefined || val === '' || val === 0) {
    return getEmptyBaseData(fieldName);
  }

  // 字符串值 → 包装为 { FNUMBER: val } 或 { FNumber: val }
  if (typeof val === 'string') {
    if (shouldUseFNumber(fieldName)) return { FNumber: val };
    return { FNUMBER: val };
  }

  // 对象值 → 提取 Number/Name/Id
  if (typeof val === 'object' && !Array.isArray(val)) {
    const obj = val as Record<string, unknown>;
    const number =
      (typeof obj.Number === 'string' ? obj.Number : undefined) ||
      (typeof obj.FNumber === 'string' ? obj.FNumber : undefined) ||
      (typeof obj.FNUMBER === 'string' ? obj.FNUMBER : undefined) ||
      '';

    if (shouldUseFNumber(fieldName)) {
      return { FNumber: number };
    }
    return { FNUMBER: number };
  }

  return getEmptyBaseData(fieldName);
}

/** 递归遍历 Model，将所有字段格式化为金蝶 Save 接口要求的格式
 * - 布尔值 → "true" / "false"
 * - 基础资料 → { FNUMBER } 或 { FNumber }
 * - 日期字符串中的 / 转为 -（保留原值，由调用方决定是否需要格式化）
 */
function prepareModelForSave(obj: any): any {
  if (obj === null || obj === undefined) return '';
  if (typeof obj === 'boolean') return obj ? 'true' : 'false';
  if (typeof obj === 'string') return obj;
  if (typeof obj === 'number') return obj;
  if (Array.isArray(obj)) return obj.map(prepareModelForSave);
  if (typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // 基础资料字段：无论值是对象、字符串还是空值，都转为正确的字典格式
      if (isBaseDataFieldName(key)) {
        result[key] = formatKdBaseData(value, key);
        continue;
      }
      // 子单据体内的基础资料字段（如 FInspectValB、FInspectValueB 等）
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value)
      ) {
        const v = value as Record<string, unknown>;
        const isBaseData =
          'Number' in v || 'Id' in v || 'Name' in v || 'FNumber' in v || 'FNUMBER' in v;
        if (
          isBaseData &&
          !key.includes('Detail') &&
          key !== 'FValueGrid' &&
          key !== 'FPolicyDetail' &&
          key !== 'FEntity_Link' &&
          key !== 'FEntityLink' &&
          key !== 'Entity_Link'
        ) {
          result[key] = formatKdBaseData(value, key);
          continue;
        }
      }
      result[key] = prepareModelForSave(value);
    }
    return result;
  }
  return String(obj);
}

/* ════════════════════════════════════════
   2. 保存/更新检验结果（Save）
   ════════════════════════════════════════ */

/**
 * 保存检验单（更新已有单据的检验项目、缺陷、决策）
 *
 * 采用金蝶标准 Save 接口，请求格式参考 View：
 * { formid: "QM_InspectBill", data: { Creator, NeedUpDateFields, Model } }
 *
 * @param bill 完整的检验单数据（必须包含 FID 或 FBILLNO）
 */
export async function saveInspectBill(
  bill: Partial<InspectBill> & { FID?: string; FBILLNO?: string },
  options?: {
    needUpdateFields?: string[];
    needReturnFields?: string[];
    /** 金蝶 Save API data 级别的额外参数（如 FEntity_Link_FRuleId） */
    extraDataFields?: Record<string, any>;
  }
): Promise<{
  success: boolean;
  billNo?: string;
  id?: string;
  diagnostics: {
    request: unknown;
    response: unknown;
    status?: KingdeeResponseStatus;
    error?: string;
  };
}> {
  // 校验失败时返回诊断而非抛错，确保 UI 能展示诊断面板
  if (!bill.FID && !bill.FBILLNO) {
    return {
      success: false,
      diagnostics: {
        request: { bill },
        response: null,
        error: '保存检验单时必须提供 FID 或 FBILLNO（当前 bill 字段: ' + Object.keys(bill).join(',') + '）',
      },
    };
  }

  // 采用金蝶标准 Save 接口格式
  // 核心修正：所有布尔参数必须使用字符串 "true" / "false"，不能用 JavaScript 布尔值
  // 金蝶服务端严格匹配字符串格式，若传布尔值 true/false 会被忽略，导致 IsDeleteEntry 默认生效为 "true"
  const data: Record<string, any> = {
    Creator: '',
    NeedReturnFields: [],
    IsDeleteEntry: 'false',
    SubSystemId: '',
    IsVerifyBaseDataField: 'false',
    IsEntryBatchFill: 'true',
    ValidateFlag: 'true',
    NumberSearch: 'true',
    IsAutoAdjustField: 'false',
    IsControlPrecision: 'false',
    ValidateRepeatJson: 'false',
    Model: prepareModelForSave(bill),
    InterationFlags: '',
    IgnoreInterationFlag: '',
    ...options?.extraDataFields,
  };

  // NeedUpDateFields 处理：
  // - 如果未提供 needUpdateFields，则不传 NeedUpDateFields（让金蝶完全根据 Model 自动判断）
  // - 如果提供了 needUpdateFields，则传入指定字段
  // 注意：某些金蝶版本对 NeedUpDateFields: [] 的处理与完全不传不同
  if (options?.needUpdateFields && options.needUpdateFields.length > 0) {
    data.NeedUpDateFields = [...new Set(options.needUpdateFields)];
  }

  const requestBody: Record<string, any> = {
    formid: FORM_ID,
    data,
  };

  let result: unknown;
  let responseError: string | undefined;
  try {
    result = await callKingdeePost<{
      ResponseStatus?: KingdeeResponseStatus;
      Result?: { ResponseStatus?: KingdeeResponseStatus; Result?: { Number?: string; Id?: string } };
    }>('Save', requestBody);
  } catch (err) {
    responseError = err instanceof Error ? err.message : String(err);
    result = null;
  }

  // 收集诊断信息
  const diagnostics = {
    request: requestBody,
    response: result,
    error: responseError,
  };

  // 如果请求抛错（网络异常、返回空、返回 HTML 等）
  if (responseError) {
    return {
      success: false,
      diagnostics: { ...diagnostics, error: responseError },
    };
  }

  // 防御：可能返回 null 或空对象
  if (!result || typeof result !== 'object') {
    return {
      success: false,
      diagnostics: { ...diagnostics, error: '接口返回异常（空或非法格式）' },
    };
  }

  // 兼容两种返回结构：
  // 1) Save 接口返回 { Result: { ResponseStatus, Result: { Number, Id } } }
  // 2) 直接返回 { ResponseStatus }
  const resultRec = result as Record<string, any>;
  const status =
    resultRec.Result?.ResponseStatus ??
    resultRec.ResponseStatus;

  if (!status || !status.IsSuccess) {
    const errs = status?.Errors;
    const firstErr = Array.isArray(errs) && errs.length > 0 ? errs[0] : undefined;
    const errMsg = firstErr?.Message || '保存检验单失败';
    return {
      success: false,
      diagnostics: { ...diagnostics, status, error: errMsg },
    };
  }

  // 提取返回的单据编号/ID
  const nestedResult = resultRec.Result?.Result;
  return {
    success: true,
    billNo: nestedResult?.Number,
    id: nestedResult?.Id,
    diagnostics: { ...diagnostics, status },
  };
}

/**
 * 更新检验项目的检测值与判定结果
}

/**
 * 更新检验项目的检测值与判定结果
 * 构造精简的 Model 只回传需要更新的字段和分录
 *
 * 注意：检验项目明细在金蝶中实际字段标识为 FItemDetail，位于 FEntity 分录下。
 */
export async function updateInspectItems(
  billId: string,
  entryId: string,
  items: Array<{
    detailId?: string;
    itemId: string;
    inspectVal: string;
    result: string;
  }>
) {
  const bill: Partial<InspectBill> = {
    FID: billId,
    FEntity: [
      {
        FEntryID: entryId,
        FItemDetail: items.map((it) => ({
          FDetailID: it.detailId ?? '0',
          FInspectItemId: { FNUMBER: it.itemId },
          FInspectVal: it.inspectVal,
          FInspectResult1: it.result,
        })),
      } as InspectBillEntry,
    ],
  };

  return saveInspectBill(bill, {
    needUpdateFields: ['FEntity.FEntryID', 'FEntity.FItemDetail'],
  });
}

/**
 * 按分析方法回传检验值（定量/定性/其他）
 *
 * 根据金蝶实际业务：
 * - 定量分析 -> FInspectValQ（数值）
 * - 定性分析 -> FInspectValB（基础资料 { FNUMBER: "编码" }，注意键名全大写）
 * - 其他分析 -> FInspectValT（字符串）
 */
export async function updateInspectValues(params: {
  billId: string;
  entryId: string;
  items: Array<{
    detailId: string;
    /** 分析方法：定量/定性/其他 */
    analysisMethod?: string;
    /** 定量值 */
    valQ?: number;
    /** 定性值（基础资料编码） */
    valB?: string;
    /** 其他值 */
    valT?: string;
  }>;
}) {
  const { billId, entryId, items } = params;

  const fItemDetail = items.map((it) => {
    const detail: Partial<InspectItemDetail> = {
      FDetailID: it.detailId,
    };
    const method = (it.analysisMethod || '').trim();
    if (method.includes('定量')) {
      if (it.valQ !== undefined) detail.FInspectValQ = it.valQ;
    } else if (method.includes('定性')) {
      // 金蝶系统要求键名为 FNUMBER（全大写）
      if (it.valB !== undefined) detail.FInspectValB = { FNUMBER: it.valB };
    } else {
      // 默认"其他"
      if (it.valT !== undefined) detail.FInspectValT = it.valT;
    }
    return detail;
  });

  const bill: Partial<InspectBill> = {
    FID: billId,
    FEntity: [
      {
        FEntryID: entryId,
        FItemDetail: fItemDetail,
      } as InspectBillEntry,
    ],
  };

  return saveInspectBill(bill, {
    needUpdateFields: ['FEntity.FEntryID', 'FEntity.FItemDetail'],
  });
}

/* ════════════════════════════════════════
   3. 查询检验项目定性检测值选项（BillQuery）
   ════════════════════════════════════════ */

export interface QualitativeOption {
  code: string; // 编码，回传 FInspectValB 用
  text: string; // 显示文字
}

const QM_IIIVRelated_FORM_ID = 'QM_IIIVRelated';
const QIR_FIELD_KEYS = [
  'FNumber', // 检验项目编码
  'FName', // 检验项目名称
  'FEntity_FInspectValueId', // 检测值编码（基础资料，可能返回对象或字符串）
  'FEntity_FInspectValueName', // 检测值名称
].join(',');

/**
 * 批量查询检验项目的定性检测值选项
 *
 * 通过 BillQuery 查询 QM_IIIVRelated（检验项目对应检测值）表单，
 * 返回按检验项目编码分组的检测值选项列表。
 *
 * @param itemIds 检验项目编码数组
 * @returns Record<itemId, QualitativeOption[]>
 */
export async function queryQualitativeOptions(
  itemIds: string[]
): Promise<Record<string, QualitativeOption[]>> {
  if (itemIds.length === 0) return {};

  // 去重并过滤空值
  const uniqueIds = [...new Set(itemIds.filter((id) => !!id))];
  if (uniqueIds.length === 0) return {};

  // 构建过滤条件：FNumber in ('code1','code2',...)
  const idList = uniqueIds.map((id) => `'${id.replace(/'/g, "\\'")}'`).join(',');
  const filterString = `FNumber in (${idList})`;

  const requestBody = {
    data: {
      FormId: QM_IIIVRelated_FORM_ID,
      FieldKeys: QIR_FIELD_KEYS,
      FilterString: filterString,
      OrderString: '',
      StartRow: 0,
      Limit: 2000,
    },
  };

  let result: unknown;
  try {
    result = await callKingdeePost<unknown>('BillQuery', requestBody);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '查询检测值选项失败';
    throw new Error(msg);
  }

  // 解析返回数据（兼容对象数组 / 二维数组 / 嵌套包装格式）
  const rows = parseBillQueryRows(result);

  // 按检验项目编码分组
  const groups: Record<string, QualitativeOption[]> = {};

  for (const row of rows) {
    // BillQuery 返回每行是一个对象或数组
    let itemCode: string | undefined;
    let valueCode: string | undefined;
    let valueName: string | undefined;

    if (Array.isArray(row)) {
      // 二维数组格式：[FNumber, FName, FInspectValueId, FInspectValueName]
      itemCode = String(row[0] ?? '');
      valueCode = extractCodeFromValue(row[2]);
      valueName = String(row[3] ?? '');
    } else if (row && typeof row === 'object') {
      // 对象数组格式
      const rec = row as Record<string, unknown>;
      itemCode = String(rec.FNumber ?? rec.FNUMBER ?? rec.fnumber ?? '');
      valueCode = extractCodeFromValue(rec.FEntity_FInspectValueId ?? rec.FEntity_FInspectValueID);
      valueName = String(rec.FEntity_FInspectValueName ?? rec.FEntity_FInspectValueNAME ?? '');
    }

    if (!itemCode || !valueCode || !valueName) continue;

    if (!groups[itemCode]) {
      groups[itemCode] = [];
    }
    // 去重：同一检验项目下相同编码只保留一次
    if (!groups[itemCode].some((o) => o.code === valueCode)) {
      groups[itemCode].push({ code: valueCode, text: valueName });
    }
  }

  return groups;
}

/** 从 BillQuery 返回的基础资料字段中提取编码字符串 */
function extractCodeFromValue(val: unknown): string | undefined {
  if (val === null || val === undefined) return undefined;
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object' && !Array.isArray(val)) {
    const obj = val as Record<string, unknown>;
    return (
      (typeof obj.FNUMBER === 'string' ? obj.FNUMBER : undefined) ||
      (typeof obj.FNumber === 'string' ? obj.FNumber : undefined) ||
      (typeof obj.Number === 'string' ? obj.Number : undefined) ||
      (typeof obj.number === 'string' ? obj.number : undefined) ||
      undefined
    );
  }
  return undefined;
}

/** 统一解析 BillQuery 返回结果为对象数组 */
function parseBillQueryRows(raw: unknown): unknown[] {
  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw;
  }

  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const nested =
      ('Result' in obj && Array.isArray(obj.Result)) ? obj.Result :
      ('data' in obj && Array.isArray(obj.data)) ? obj.data :
      ('response' in obj && Array.isArray(obj.response)) ? obj.response :
      ('Response' in obj && Array.isArray(obj.Response)) ? obj.Response :
      undefined;
    if (nested !== undefined) return nested;

    // 空结果
    if (
      ('Result' in obj && (obj.Result === null || obj.Result === undefined)) ||
      ('data' in obj && (obj.data === null || obj.data === undefined))
    ) {
      return [];
    }
  }

  return [];
}

/**
 * 更新缺陷记录
 */
export async function updateDefects(
  billId: string,
  defects: DefectInfo[],
  options?: { isNew?: boolean }
) {
  const bill: Partial<InspectBill> = {
    FID: billId,
    FEntity: [
      {
        FEntryID: '0',
        FDefectDetail: defects.map((d) => ({
          Id: d.detail_id ? (d.detail_id.startsWith('temp_') ? '0' : d.detail_id) : '0',
          FDefectTypeId: { FNUMBER: encodeDefectType(d.defect_type) || d.defect_type },
          FDefectQty: d.defect_qty,
          FDefectReasonId: d.defect_reason ? { FNUMBER: encodeDefectReason(d.defect_reason) || d.defect_reason } : undefined,
          FDefectLevel: encodeDefectLevel(d.defect_level) || d.defect_level,
          FDefectResultId: d.defect_result ? { FNUMBER: encodeDefectResult(d.defect_result) || d.defect_result } : undefined,
        })),
      } as InspectBillEntry,
    ],
  };

  return saveInspectBill(bill, {
    needUpdateFields: ['FEntity.FEntryID', 'FEntity.FDefectDetail'],
  });
}

/**
 * 更新使用决策（在表体 FEntity 中）
 */
export async function updateDecisions(
  billId: string,
  entryId: string,
  decision: DecisionInfo
) {
  const bill: Partial<InspectBill> = {
    FID: billId,
    FEntity: [
      {
        FEntryID: entryId,
        FPolicyDetail: [
          {
            FPolicyStatus: encodePolicyStatus(decision.policy_status) ?? '',
            FPolicyQty: decision.policy_qty ?? 0,
            FUsePolicy: encodeUsePolicy(decision.use_policy) ?? '',
            FIsDefectProcess: decision.is_defect_process ? 'true' : 'false',
            FIsMRBReview: decision.is_mrb_review ? 'true' : 'false',
          },
        ],
      } as InspectBillEntry,
    ],
  };

  return saveInspectBill(bill, {
    needUpdateFields: ['FEntity.FEntryID', 'FEntity.FPolicyDetail'],
  });
}

/* ════════════════════════════════════════
   FEntity 分录字段名映射（View → Save）
   ════════════════════════════════════════ */

const ENTRY_FIELD_MAP: Record<string, string> = {
  Id: 'FEntryID',
  FEntryId: 'FEntryID',
  FEntryID: 'FEntryID',
  Seq: 'FSeq',
  FSeq: 'FSeq',
  MaterialId: 'FMaterialId',
  FMaterialID: 'FMaterialId',
  FMATERIALID: 'FMaterialId',
  FMaterialId: 'FMaterialId',
  UnitId: 'FUnitID',
  FUnitId: 'FUnitID',
  FUNITID: 'FUnitID',
  FUnitID: 'FUnitID',
  BaseUnitId: 'FBaseUnitId',
  FBaseUnitId: 'FBaseUnitId',
  FBASEUNITID: 'FBaseUnitId',
  InspectQty: 'FInspectQty',
  FInspectQty: 'FInspectQty',
  FINSPECTQTY: 'FInspectQty',
  BaseInspectQty: 'FBaseInspectQty',
  FBaseInspectQty: 'FBaseInspectQty',
  QualifiedQty: 'FQualifiedQty',
  FQualifiedQty: 'FQualifiedQty',
  UnQualifiedQty: 'FUnQualifiedQty',
  FUnQualifiedQty: 'FUnQualifiedQty',
  SupplierId: 'FSupplierId',
  FSupplierId: 'FSupplierId',
  FSUPPLIERID: 'FSupplierId',
  WorkshopId: 'FWorkshopId',
  FWorkshopId: 'FWorkshopId',
  FWORKSHOPID: 'FWorkshopId',
  StockId: 'FStockId',
  FStockId: 'FStockId',
  FSTOCKID: 'FStockId',
  StockLocId: 'FStockLocId',
  FStockLocId: 'FStockLocId',
  FSTOCKLOCID: 'FStockLocId',
  QCSchemeId: 'FQCSchemeId',
  FQCSchemeId: 'FQCSchemeId',
  FQCSCHEMEID: 'FQCSchemeId',
  Lot: 'FLot',
  FLot: 'FLot',
  FLOT: 'FLot',
  Memo: 'FMemo',
  FMemo: 'FMemo',
  FMEMO: 'FMemo',
  InspectResult: 'FInspectResult',
  FInspectResult: 'FInspectResult',
  InspectDepId: 'FInspectDepId',
  FInspectDepId: 'FInspectDepId',
  FINSPECTDEPID: 'FInspectDepId',
  InspectOrgId: 'FInspectOrgId',
  FInspectOrgId: 'FInspectOrgId',
  FINSPECTORGID: 'FInspectOrgId',
  InspectorId: 'FInspectorId',
  FInspectorId: 'FInspectorId',
  FINSPECTORID: 'FInspectorId',
  BillTypeID: 'FBillTypeID',
  FBillTypeID: 'FBillTypeID',
  FBILLTYPEID: 'FBillTypeID',
  DocumentStatus: 'FDocumentStatus',
  FDocumentStatus: 'FDocumentStatus',
  Date: 'FDate',
  FDate: 'FDate',
  FDATE: 'FDate',
  CreatorId: 'FCreatorID',
  FCreatorId: 'FCreatorID',
  FCREATORID: 'FCreatorID',
  ApproverId: 'FApproverID',
  FApproverId: 'FApproverID',
  FAPPROVERID: 'FApproverID',
  CreateDate: 'FCreateDate',
  FCreateDate: 'FCreateDate',
  ApproveDate: 'FApproveDate',
  FApproveDate: 'FApproveDate',
  ModifierId: 'FModifierID',
  FModifierId: 'FModifierID',
  FMODIFIERID: 'FModifierID',
  ModifyDate: 'FModifyDate',
  FModifyDate: 'FModifyDate',
  CancelerId: 'FCancelerID',
  FCancelerId: 'FCancelerID',
  FCANCELERID: 'FCancelerID',
  CancelDate: 'FCancelDate',
  FCancelDate: 'FCancelDate',
  CancelStatus: 'FCancelStatus',
  FCancelStatus: 'FCancelStatus',
  SourceBillType: 'FSourceBillType',
  FSourceBillType: 'FSourceBillType',
  SourceBillNo: 'FSourceBillNo',
  FSourceBillNo: 'FSourceBillNo',
  SourceSeq: 'FSourceSeq',
  FSourceSeq: 'FSourceSeq',
  EntityLinkFRuleId: 'FEntity_Link_FRuleId',
  FEntityLinkFRuleId: 'FEntity_Link_FRuleId',
  FEntity_Link_FRuleId: 'FEntity_Link_FRuleId',
  FENTITY_LINK_FRULEID: 'FEntity_Link_FRuleId',
};

/**
 * 规范化 FEntity 分录字段名（View 返回的字段名可能与 Save 接口期望的不一致）
 * 将全大写/驼峰/无F前缀字段名统一转换为 Save 接口标准格式，同时转换基础资料对象为 { FNumber }
 */
function normalizeEntryForSave(entry: any): any {
  const normalized: any = {};
  for (const [key, value] of Object.entries(entry)) {
    if (key.endsWith('_Id') && !key.startsWith('FEntity')) continue;

    const targetKey = ENTRY_FIELD_MAP[key] || key;

    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !targetKey.includes('Detail') &&
      !(value as any).FNUMBER &&
      !(value as any).FNumber
    ) {
      const base = value as any;
      if ('Number' in base || 'Id' in base || 'Name' in base) {
        normalized[targetKey] = shouldUseFNumber(targetKey)
          ? { FNumber: base.Number || '' }
          : { FNUMBER: base.Number || '' };
        continue;
      }
    }

    normalized[targetKey] = value;
  }
  return normalized;
}

/**
 * 提交整单检验结果（包含检测值、判定、整单结论、检验员、时间）
 * @returns diagnostics 包含完整请求体和响应体，供 UI 诊断展示
 */
export async function submitInspectionResult(params: {
  billId: string;
  inspector: string;
  billResult: string; // 合格/不合格/让步
  entryId?: string; // 表体分录内码（检验项目明细位于 FEntity.FItemDetail 下）
  items?: ItemInfo[];
  defects?: DefectInfo[];
  decisions?: Array<{ entryId: string } & DecisionInfo>;
  rawBill?: InspectBill;
}): Promise<{
  success: boolean;
  diagnostics: {
    request: unknown;
    response: unknown;
    error?: string;
    status?: KingdeeResponseStatus;
    fEntityDiagnostics?: unknown;
  };
}> {
  const { billId, inspector, billResult, entryId, items, defects, decisions, rawBill } = params;

  // 1. 获取正确的 FEntryID（优先级：显式传入 > decisions > rawBill > 兜底）
  // 注意：空字符串 "" 也视为无效，使用 || 而非 ??
  // 同时兼容 FEntity 和 Entity（金蝶 View API 返回的字段名可能是 Entity）
  // 分录内码字段兼容 FEntryID / FEntryId / Id
  const rawBillEntity = (rawBill as any)?.FEntity || (rawBill as any)?.Entity;
  const effectiveEntryId =
    (entryId && entryId !== '0' ? entryId : '') ||
    (decisions?.[0]?.entryId && decisions[0].entryId !== '0' ? decisions[0].entryId : '') ||
    String(rawBillEntity?.[0]?.FEntryID ?? '') ||
    String(rawBillEntity?.[0]?.FEntryId ?? '') ||
    String(rawBillEntity?.[0]?.Id ?? '') ||
    '0';

  // 1.5 如果 rawBill 缺失，自动重新拉取完整单据（确保分录字段完整）
  let resolvedRawBill = rawBill;
  let rawBillSource = 'params';
  if (!resolvedRawBill || !Array.isArray((resolvedRawBill as any)?.FEntity || (resolvedRawBill as any)?.Entity)) {
    try {
      resolvedRawBill = await viewInspectBill({ id: billId });
      rawBillSource = 'view_api';
    } catch (viewErr) {
      // 拉取失败则继续用 params 传入的 rawBill（可能为 null）
      rawBillSource = 'view_api_failed: ' + (viewErr instanceof Error ? viewErr.message : String(viewErr));
    }
  }

  // 2. 从 rawBill 中找到对应分录并深拷贝作为基底
  let rawEntry: any = null;
  const rawEntityArray = (resolvedRawBill as any)?.FEntity || (resolvedRawBill as any)?.Entity;
  if (Array.isArray(rawEntityArray) && rawEntityArray.length > 0) {
    rawEntry =
      rawEntityArray.find(
        (e: any) => String(e.FEntryID || e.FEntryId || e.Id || '') === effectiveEntryId
      ) || rawEntityArray[0];
  }

  // 2.5 如果 rawBill 是扁平结构（View API 返回子单据体直接在主表下），
  // 从顶层获取原始子单据体构造 FEntity
  const rawBillFlat = resolvedRawBill as any;
  if (!rawEntry && rawBillFlat) {
    const flatItemDetail = rawBillFlat.FItemDetail || rawBillFlat.F_QM_IBITEMDETAIL;
    const flatDefectDetail = rawBillFlat.FDefectDetail || rawBillFlat.F_QM_IBDEFECTDETAIL;
    const flatPolicyDetail = rawBillFlat.FPolicyDetail || rawBillFlat.F_QM_IBPOLICYDETAIL;
    if (Array.isArray(flatItemDetail) || Array.isArray(flatDefectDetail) || Array.isArray(flatPolicyDetail)) {
      rawEntry = {
        FEntryID: effectiveEntryId,
        FItemDetail: Array.isArray(flatItemDetail) ? JSON.parse(JSON.stringify(flatItemDetail)) : [],
        FDefectDetail: Array.isArray(flatDefectDetail) ? JSON.parse(JSON.stringify(flatDefectDetail)) : [],
        FPolicyDetail: Array.isArray(flatPolicyDetail) ? JSON.parse(JSON.stringify(flatPolicyDetail)) : [],
      };
    }
  }

  const mergedEntry: any = rawEntry
    ? JSON.parse(JSON.stringify(rawEntry))
    : { FEntryID: effectiveEntryId };
  // 优先使用 rawEntry 中的真实分录内码（兼容 FEntryID / FEntryId / Id）
  mergedEntry.FEntryID = rawEntry?.FEntryID || rawEntry?.FEntryId || rawEntry?.Id || effectiveEntryId;

  // 规范化字段名：将 View API 的字段名转换为 Save API 标准格式
  // 同时清理 _Id 后缀冗余字段、转换基础资料对象为正确格式
  const normalizedEntry = normalizeEntryForSave(mergedEntry);

  // 处理 FEntity_Link 关联关系（关键修复）
  // 金蝶 View API 返回的 FEntity_Link 数组使用原始字段名（Id, RuleId, SId, STableId 等）
  // Save API 应该保留原始字段名，不要映射为带 F 前缀的字段名
  // 同时设置平铺字段 FEntity_Link_FRuleId（金蝶某些版本可能要求）
  const fEntityLink = normalizedEntry.FEntity_Link || normalizedEntry.FEntityLink || normalizedEntry.Entity_Link;
  if (Array.isArray(fEntityLink) && fEntityLink.length > 0) {
    // 保留原始 FEntity_Link 数组，不做字段名映射
    // 只确保 RuleId 有值（从原始数据中提取）
    const firstLink = fEntityLink[0];
    const ruleId = String(firstLink.RuleId ?? firstLink.FRuleId ?? '');
    if (ruleId) {
      // 同步平铺字段（金蝶某些版本可能检查此字段）
      normalizedEntry.FEntity_Link_FRuleId = ruleId;
    }
  } else {
    // 如果没有 FEntity_Link 数组，尝试从平铺字段构造
    const ruleId = normalizedEntry.FEntity_Link_FRuleId;
    if (ruleId && ruleId !== '0') {
      normalizedEntry.FEntity_Link = [{
        Id: 0,
        RuleId: ruleId,
        STableId: normalizedEntry.SrcEntryId ?? 0,
        STableName: '',
        SBillId: '',
        SId: normalizedEntry.SrcEntryId ?? 0,
      }];
    }
  }

  // 3. 构造极简 Model：只传程序中可编辑的字段
  // 核心原则：FID 和 FEntryID 有真实内码时，金蝶识别为修改操作
  // 只传递用户在程序中编辑的字段（检验项目、缺陷记录、使用决策）
  const modelEntry: any = {
    FEntryID: effectiveEntryId,
  };

  // 3.1 检验项目（FItemDetail）
  if (items && items.length > 0) {
    modelEntry.FItemDetail = items.map((it) => {
      const detailId = it.detail_id ?? '0';

      // 检验结果编码：合格 = "1"，不合格 = "2"
      const resultText = it.result ?? autoJudge(it.inspect_val ?? '', it.upper_limit, it.lower_limit);
      const resultCode = resultText === '不合格' ? '2' : '1';

      const detail: any = {
        FDetailID: detailId,
        FInspectItemId: { FNUMBER: it.item_id },
        FInspectResult1: resultCode,
      };

      // 根据分析方法回传检验值：定量/定性/其他
      const method = (it.analysis_method || '定量').trim();
      const val = it.inspect_val ?? '';

      if (method.includes('定量')) {
        const numVal = parseFloat(val);
        if (!isNaN(numVal)) {
          detail.FInspectValQ = numVal;
        }
      } else if (method.includes('定性')) {
        detail.FInspectValB = { FNUMBER: val };
      } else if (method) {
        detail.FInspectValT = val;
      }

      return detail;
    });
  }

  // 3.2 缺陷记录（FDefectDetail）
  if (defects && defects.length > 0) {
    modelEntry.FDefectDetail = defects.map((d) => {
      const detailId = d.detail_id ?? '0';
      const isNew = detailId === '0' || detailId.startsWith('temp_');

      return {
        FDetailID: isNew ? '0' : detailId,
        FDefectTypeId: { FNUMBER: encodeDefectType(d.defect_type) || d.defect_type },
        FDefectQty: d.defect_qty,
        FDefectReasonId: d.defect_reason ? { FNUMBER: encodeDefectReason(d.defect_reason) || d.defect_reason } : { FNUMBER: '' },
        FDefectLevel: encodeDefectLevel(d.defect_level) || d.defect_level,
        FDefectResultId: d.defect_result ? { FNUMBER: encodeDefectResult(d.defect_result) || d.defect_result } : { FNUMBER: '' },
      };
    });
  }

  // 3.3 使用决策（FPolicyDetail）
  if (decisions && decisions.length > 0) {
    modelEntry.FPolicyDetail = decisions.map((dec) => {
      const detailId = (dec as any).detail_id ?? '0';

      return {
        FDetailID: detailId,
        FPolicyStatus: encodePolicyStatus(dec.policy_status) ?? '',
        FPolicyQty: dec.policy_qty ?? 0,
        FUsePolicy: encodeUsePolicy(dec.use_policy) ?? '',
        FIsDefectProcess: dec.is_defect_process ? 'true' : 'false',
        FIsMRBReview: dec.is_mrb_review ? 'true' : 'false',
      };
    });
  }

  // 4. 构造极简 Model
  const model: any = {
    FID: billId,
    FEntity: [modelEntry],
  };

  // 5. 构造极简请求（只传 IsDeleteEntry 和 Model）
  const data: Record<string, any> = {
    IsDeleteEntry: 'false',
    Model: model,
  };

  const requestBody = {
    formid: FORM_ID,
    data,
  };

  // 不传 NeedUpDateFields（保持空数组），让金蝶根据完整 Model 自动更新
  const resolvedEntity = (resolvedRawBill as any)?.FEntity || (resolvedRawBill as any)?.Entity;
  const fEntityDiagnostics = {
    effectiveEntryId,
    hasRawEntry: !!rawEntry,
    rawBillSource,
    itemCount: items?.length ?? 0,
    defectCount: defects?.length ?? 0,
    decisionCount: decisions?.length ?? 0,
    modelEntryKeys: Object.keys(modelEntry),
    hasFDefectDetail: !!modelEntry.FDefectDetail,
    hasFPolicyDetail: !!modelEntry.FPolicyDetail,
  };

  let result: unknown;
  let responseError: string | undefined;
  try {
    result = await callKingdeePost<{
      ResponseStatus?: KingdeeResponseStatus;
      Result?: { ResponseStatus?: KingdeeResponseStatus; Result?: { Number?: string; Id?: string } };
    }>('Save', requestBody);
  } catch (err) {
    responseError = err instanceof Error ? err.message : String(err);
    result = null;
  }

  // 收集诊断信息
  const diagnostics = {
    request: requestBody,
    response: result,
    error: responseError,
  };

  // 如果请求抛错
  if (responseError) {
    return {
      success: false,
      diagnostics: { ...diagnostics, error: responseError, fEntityDiagnostics },
    };
  }

  // 防御：可能返回 null 或空对象
  if (!result || typeof result !== 'object') {
    return {
      success: false,
      diagnostics: { ...diagnostics, error: '接口返回异常（空或非法格式）', fEntityDiagnostics },
    };
  }

  // 兼容两种返回结构
  const resultRec = result as Record<string, any>;
  const status =
    resultRec.Result?.ResponseStatus ??
    resultRec.ResponseStatus;

  if (!status || !status.IsSuccess) {
    const errs = status?.Errors;
    const firstErr = Array.isArray(errs) && errs.length > 0 ? errs[0] : undefined;
    const errMsg = firstErr?.Message || '保存检验单失败';
    return {
      success: false,
      diagnostics: { ...diagnostics, status, error: errMsg, fEntityDiagnostics },
    };
  }

  // 提取返回的单据编号/ID
  const nestedResult = resultRec.Result?.Result;
  return {
    success: true,
    diagnostics: { ...diagnostics, status, fEntityDiagnostics },
  };
}

/* ════════════════════════════════════════
   3. 提交与审核
   ════════════════════════════════════════ */

/** 提交单据 */
export async function submitInspectBill(numbers: string[], orgId?: number) {
  const param: SubmitParam = {
    CreateOrgId: orgId ?? 0,
    Numbers: numbers,
  };

  const result = await callKingdee<{
    Result: { ResponseStatus: KingdeeResponseStatus };
    ResponseStatus: KingdeeResponseStatus;
  }>('Submit', [FORM_ID, toKdJson(param)]);

  const status = result.Result?.ResponseStatus ?? result.ResponseStatus;
  if (!status.IsSuccess) {
    const err = status.Errors?.[0];
    throw new Error(err?.Message || '提交检验单失败');
  }
  return { success: true };
}

/** 审核单据 */
export async function auditInspectBill(numbers: string[], orgId?: number) {
  const param: AuditParam = {
    CreateOrgId: orgId ?? 0,
    Numbers: numbers,
  };

  const result = await callKingdee<{
    Result: { ResponseStatus: KingdeeResponseStatus };
    ResponseStatus: KingdeeResponseStatus;
  }>('Audit', [FORM_ID, toKdJson(param)]);

  const status = result.Result?.ResponseStatus ?? result.ResponseStatus;
  if (!status.IsSuccess) {
    const err = status.Errors?.[0];
    throw new Error(err?.Message || '审核检验单失败');
  }
  return { success: true };
}

/* ════════════════════════════════════════
   4. 辅助映射
   ════════════════════════════════════════ */

function mapKdStatusForQuery(status: string): string {
  switch (status) {
    case 'pending':
      return "FDocumentStatus = 'Z' or FDocumentStatus = 'A'";
    case 'inspecting':
      return "FDocumentStatus = 'B'";
    case 'completed':
      return "FDocumentStatus = 'C'";
    default:
      return '';
  }
}

function mapBillTypeName(typeId: unknown): string {
  const id = String(typeId ?? '');
  if (id.includes('JYD001') || id.includes('Incoming') || id.includes(' incoming')) return '来料检验';
  if (id.includes('JYD002') || id.includes('Process') || id.includes('process')) return '过程检验';
  if (id.includes('JYD003') || id.includes('Shipping') || id.includes('shipping')) return '出货检验';
  return id;
}

/**
 * 对 FilterString 中的用户输入值做简单转义
 * 防止单引号破坏过滤条件语法
 */
function escapeFilterValue(val: string): string {
  return val.replace(/'/g, "''");
}

/* ════════════════════════════════════════
   使用决策编码映射（金蝶 ↔ APP 中文）
   ════════════════════════════════════════ */

/** 状态：金蝶编码 → 中文 */
const POLICY_STATUS_DECODE: Record<string, string> = {
  '1': '合格',
  '2': '不合格',
};

/** 状态：中文 → 金蝶编码 */
const POLICY_STATUS_ENCODE: Record<string, string> = {
  '合格': '1',
  '不合格': '2',
};

/** 使用决策：金蝶编码 → 中文 */
const USE_POLICY_DECODE: Record<string, string> = {
  'A': '接收',
  'C': '返修',
  'D': '报废',
  'F': '判退',
  'G': '不良',
};

/** 使用决策：中文 → 金蝶编码 */
const USE_POLICY_ENCODE: Record<string, string> = {
  '接收': 'A',
  '返修': 'C',
  '报废': 'D',
  '判退': 'F',
  '不良': 'G',
};

/** 将金蝶状态编码解析为中文（兼容基础资料对象和字符串） */
function decodePolicyStatus(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  if (typeof raw === 'string') {
    return POLICY_STATUS_DECODE[raw] ?? raw;
  }
  if (typeof raw === 'object') {
    const base = resolveBaseData(raw);
    if (base.number) return POLICY_STATUS_DECODE[base.number] ?? base.number;
    if (base.name) return POLICY_STATUS_DECODE[base.name] ?? base.name;
  }
  return undefined;
}

/** 将金蝶使用决策编码解析为中文（兼容基础资料对象和字符串） */
function decodeUsePolicy(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  if (typeof raw === 'string') {
    return USE_POLICY_DECODE[raw] ?? raw;
  }
  if (typeof raw === 'object') {
    const base = resolveBaseData(raw);
    if (base.number) return USE_POLICY_DECODE[base.number] ?? base.number;
    if (base.name) return USE_POLICY_DECODE[base.name] ?? base.name;
  }
  return undefined;
}

/** 将中文状态编码为金蝶编码 */
export function encodePolicyStatus(text: string | undefined): string | undefined {
  if (!text) return undefined;
  return POLICY_STATUS_ENCODE[text] ?? text;
}

/** 将中文使用决策编码为金蝶编码 */
export function encodeUsePolicy(text: string | undefined): string | undefined {
  if (!text) return undefined;
  return USE_POLICY_ENCODE[text] ?? text;
}

/* ════════════════════════════════════════
   缺陷记录编码映射（金蝶基础资料编码 ↔ APP 中文）
   ════════════════════════════════════════ */

/** 缺陷类型：中文 → 金蝶编码 */
const DEFECT_TYPE_ENCODE: Record<string, string> = {
  '外观缺陷': 'QXLX000001',
  '包装缺陷': 'QXLX000002',
  '尺寸缺陷': 'QXLX000003',
  '性能缺陷': 'QXLX000004',
  '功能缺陷': 'QXLX000005',
};

/** 缺陷类型：金蝶编码 → 中文 */
const DEFECT_TYPE_DECODE: Record<string, string> = {
  'QXLX000001': '外观缺陷',
  'QXLX000002': '包装缺陷',
  'QXLX000003': '尺寸缺陷',
  'QXLX000004': '性能缺陷',
  'QXLX000005': '功能缺陷',
};

/** 缺陷原因：中文 → 金蝶编码 */
const DEFECT_REASON_ENCODE: Record<string, string> = {
  '人员误操作': 'QXYY000001_SYS',
  '管理漏洞': 'QXYY000002_SYS',
  '机器问题': 'QXYY000003_SYS',
  '物料原因': 'QXYY000004_SYS',
  '检测方法': 'QXYY000005_SYS',
};

/** 缺陷原因：金蝶编码 → 中文 */
const DEFECT_REASON_DECODE: Record<string, string> = {
  'QXYY000001_SYS': '人员误操作',
  'QXYY000002_SYS': '管理漏洞',
  'QXYY000003_SYS': '机器问题',
  'QXYY000004_SYS': '物料原因',
  'QXYY000005_SYS': '检测方法',
};

/** 缺陷后果：中文 → 金蝶编码 */
const DEFECT_RESULT_ENCODE: Record<string, string> = {
  '返修': 'QXHG000001',
  '挑选': 'QXHG000002',
  '退货': 'QXHG000003',
  '特采': 'QXHG000004',
  '报废': 'QXHG000005',
};

/** 缺陷后果：金蝶编码 → 中文 */
const DEFECT_RESULT_DECODE: Record<string, string> = {
  'QXHG000001': '返修',
  'QXHG000002': '挑选',
  'QXHG000003': '退货',
  'QXHG000004': '特采',
  'QXHG000005': '报废',
};

/** 缺陷等级：中文 → 金蝶编码 */
const DEFECT_LEVEL_ENCODE: Record<string, string> = {
  '致命缺陷': '1',
  '重缺陷': '2',
  '轻缺陷': '3',
};

/** 缺陷等级：金蝶编码 → 中文 */
const DEFECT_LEVEL_DECODE: Record<string, string> = {
  '1': '致命缺陷',
  '2': '重缺陷',
  '3': '轻缺陷',
};

/** 将中文缺陷类型编码为金蝶基础资料编码 */
export function encodeDefectType(text: string | undefined): string | undefined {
  if (!text) return undefined;
  return DEFECT_TYPE_ENCODE[text] ?? text;
}

/** 将金蝶基础资料编码解析为中文缺陷类型 */
export function decodeDefectType(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  const base = typeof raw === 'object' ? resolveBaseData(raw) : { number: String(raw), name: undefined };
  return DEFECT_TYPE_DECODE[base.number || ''] ?? base.name ?? base.number ?? undefined;
}

/** 将中文缺陷原因编码为金蝶基础资料编码 */
export function encodeDefectReason(text: string | undefined): string | undefined {
  if (!text) return undefined;
  return DEFECT_REASON_ENCODE[text] ?? text;
}

/** 将金蝶基础资料编码解析为中文缺陷原因 */
export function decodeDefectReason(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  const base = typeof raw === 'object' ? resolveBaseData(raw) : { number: String(raw), name: undefined };
  return DEFECT_REASON_DECODE[base.number || ''] ?? base.name ?? base.number ?? undefined;
}

/** 将中文缺陷后果编码为金蝶基础资料编码 */
export function encodeDefectResult(text: string | undefined): string | undefined {
  if (!text) return undefined;
  return DEFECT_RESULT_ENCODE[text] ?? text;
}

/** 将金蝶基础资料编码解析为中文缺陷后果 */
export function decodeDefectResult(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  const base = typeof raw === 'object' ? resolveBaseData(raw) : { number: String(raw), name: undefined };
  return DEFECT_RESULT_DECODE[base.number || ''] ?? base.name ?? base.number ?? undefined;
}

/** 将中文缺陷等级编码为金蝶编码 */
export function encodeDefectLevel(text: string | undefined): string | undefined {
  if (!text) return undefined;
  return DEFECT_LEVEL_ENCODE[text] ?? text;
}

/** 将金蝶编码解析为中文缺陷等级 */
export function decodeDefectLevel(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  const base = typeof raw === 'object' ? resolveBaseData(raw) : { number: String(raw), name: undefined };
  return DEFECT_LEVEL_DECODE[base.number || ''] ?? base.name ?? base.number ?? undefined;
}

/** 在任意对象中不区分大小写查找字段 */
function findFieldInObj(obj: Record<string, unknown> | null | undefined, candidates: string[]): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const key of candidates) {
    if (key in obj) return key;
  }
  const lowerMap = Object.fromEntries(
    Object.keys(obj).map((k) => [k.toLowerCase(), k])
  );
  for (const key of candidates) {
    const actual = lowerMap[key.toLowerCase()];
    if (actual) return actual;
  }
  return undefined;
}

/** 辅助：从对象中按候选字段名提取原始值（只查一次） */
function pickValue(obj: Record<string, unknown>, candidates: string[]): unknown {
  const key = findFieldInObj(obj, candidates);
  return key != null ? obj[key] : undefined;
}

/** 辅助：从对象中按候选字段名提取字符串 */
function pickString(obj: Record<string, unknown>, candidates: string[]): string | undefined {
  const val = pickValue(obj, candidates);
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  return undefined;
}

/** 辅助：从对象中按候选字段名提取数值 */
function pickNumber(obj: Record<string, unknown>, candidates: string[]): number | undefined {
  const val = pickValue(obj, candidates);
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const parsed = parseFloat(val);
    if (!isNaN(parsed)) return parsed;
  }
  return undefined;
}

/** 辅助：从对象中按候选字段名提取基础资料 */
function pickBaseData(obj: Record<string, unknown>, candidates: string[]): { number?: string; name?: string } {
  return resolveBaseData(pickValue(obj, candidates));
}

/* ════════════════════════════════════════
   5. 数据转换（金蝶 → APP 本地模型）
   ════════════════════════════════════════ */

/** 从记录中提取定性检验值编码（FInspectValB 基础资料对象） */
function extractInspectValB(rec: Record<string, unknown>): string | undefined {
  const val = rec.FInspectValB ?? rec.FInspectValb ?? rec.InspectValB;
  if (val === null || val === undefined) return undefined;
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object' && !Array.isArray(val)) {
    const obj = val as Record<string, unknown>;
    return (
      (typeof obj.FNUMBER === 'string' ? obj.FNUMBER : undefined) ||
      (typeof obj.FNumber === 'string' ? obj.FNumber : undefined) ||
      (typeof obj.Number === 'string' ? obj.Number : undefined) ||
      (typeof obj.number === 'string' ? obj.number : undefined) ||
      undefined
    );
  }
  return undefined;
}

export function convertBillToLocal(bill: InspectBill): {
  order: OrderSummary;
  material: MaterialInfo | undefined;
  decisions: DecisionInfo[];
  items: ItemInfo[];
  defects: DefectInfo[];
} {
  if (!bill || typeof bill !== 'object' || Array.isArray(bill)) {
    throw new Error(
      `convertBillToLocal: bill 格式异常，实际类型: ${Array.isArray(bill) ? 'array' : typeof bill}`
    );
  }

  const billRec = bill as unknown as Record<string, unknown>;
  const entryArrKey = findFieldInObj(billRec, ['FEntity', 'Entity']);
  const entry = entryArrKey ? (billRec[entryArrKey] as InspectBillEntry[])?.[0] : undefined;
  const materialSource = entry ?? (bill as unknown as InspectBillEntry);

  // ════════════════════════════════════════
  // 主表信息
  // ════════════════════════════════════════
  const idKey = findFieldInObj(billRec, ['FID', 'Id']);
  const billNoKey = findFieldInObj(billRec, ['FBILLNO', 'FBillNo', 'BillNo']);
  const dateKey = findFieldInObj(billRec, ['FDate', 'Date']);
  const billTypeKey = findFieldInObj(billRec, ['FBILLTYPEID', 'FBillTypeID', 'BillTypeID']);
  const docStatusKey = findFieldInObj(billRec, ['FDocumentStatus', 'DocumentStatus']);
  const creatorKey = findFieldInObj(billRec, ['FCreatorID', 'FCreatorId', 'CreatorId', 'FCREATORID']);
  const approverKey = findFieldInObj(billRec, ['FApproverID', 'FApproverId', 'ApproverId', 'FAPPROVERID']);
  const createDateKey = findFieldInObj(billRec, ['FCreateDate', 'CreateDate', 'FCREATEDATE']);
  const approveDateKey = findFieldInObj(billRec, ['FApproveDate', 'ApproveDate', 'FAPPROVEDATE']);

  const creatorBase = resolveBaseData(creatorKey != null ? billRec[creatorKey] : undefined);
  const approverBase = resolveBaseData(approverKey != null ? billRec[approverKey] : undefined);
  const billTypeBase = resolveBaseData(billTypeKey != null ? billRec[billTypeKey] : undefined);
  const inspectOrgBase = pickBaseData(billRec, ['FInspectOrgId', 'FINSPECTORGID', 'InspectOrgId']);
  const sourceOrgBase = pickBaseData(billRec, ['FSourceOrgId', 'FSOURCEORGID', 'SourceOrgId']);

  const order: OrderSummary = {
    id: idKey != null ? String(billRec[idKey] ?? '') : '',
    order_no: pickString(billRec, ['FBILLNO', 'FBillNo', 'BillNo']) || '',
    date: pickString(billRec, ['FDate', 'Date']) || '',
    type_id: billTypeBase.number || '',
    type: mapBillTypeName(billTypeBase.number),
    document_status: pickString(billRec, ['FDocumentStatus', 'DocumentStatus']) || '',
    status: mapDocumentStatus(pickString(billRec, ['FDocumentStatus', 'DocumentStatus']) ?? ''),
    creator_name: creatorBase.name,
    creator_number: creatorBase.number,
    approver_name: approverBase.name,
    approver_number: approverBase.number,
    create_date: pickString(billRec, ['FCreateDate', 'CreateDate', 'FCREATEDATE']),
    approve_date: pickString(billRec, ['FApproveDate', 'ApproveDate', 'FAPPROVEDATE']),
    inspect_org_name: inspectOrgBase.name || inspectOrgBase.number,
    source_org_name: sourceOrgBase.name || sourceOrgBase.number,
  };

  // ════════════════════════════════════════
  // 物料信息
  // ════════════════════════════════════════
  const matRec = materialSource as unknown as Record<string, unknown>;
  const matBase = pickBaseData(matRec, ['FMATERIALID', 'FMaterialID', 'MaterialID']);
  const unitBase = pickBaseData(matRec, ['FUnitID', 'FUNITID', 'UnitID']);

  const material: MaterialInfo | undefined = materialSource
    ? {
        entry_id: pickString(matRec, ['FEntryID', 'FEntryId', 'EntryId']) || '',
        material_code: matBase.number || '',
        material_name:
          matBase.name || pickString(matRec, ['FMaterialName', 'MaterialName']) || '',
        material_model: pickString(matRec, ['FMaterialModel', 'MaterialModel']),
        unit: unitBase.number || '',
        inspect_qty: pickNumber(matRec, ['FINSPECTQTY', 'FInspectQty', 'InspectQty']) ?? 0,
        qualified_qty: pickNumber(matRec, ['FQualifiedQty', 'QualifiedQty']),
        unqualified_qty: pickNumber(matRec, ['FUnQualifiedQty', 'UnQualifiedQty']),
        inspect_result: pickBaseData(matRec, ['FInspectResult', 'InspectResult']).name,
      }
    : undefined;

  // ════════════════════════════════════════
  // 使用决策
  // ════════════════════════════════════════
  const entryPolicyDetailKey = entry
    ? findFieldInObj(entry as unknown as Record<string, unknown>, ['FPolicyDetail', 'PolicyDetail'])
    : undefined;
  const entryPolicyDetails = entryPolicyDetailKey
    ? ((entry as unknown as Record<string, unknown>)[entryPolicyDetailKey] as Array<Record<string, unknown>>)
    : undefined;
  const billPolicyDetailKey = findFieldInObj(billRec, ['F_QM_IBPOLICYDETAIL', 'QM_IBPOLICYDETAIL']);
  const billPolicyDetails = billPolicyDetailKey
    ? (billRec[billPolicyDetailKey] as Array<Record<string, unknown>>)
    : undefined;
  const policyDetails = (entryPolicyDetails?.length ?? 0) > 0 ? entryPolicyDetails : billPolicyDetails;

  const decisions: DecisionInfo[] = (policyDetails ?? []).map((pd) => {
    const pdRec = pd as Record<string, unknown>;
    return {
      detail_id: pickString(pdRec, ['FDetailID', 'DetailID', 'Id']) ?? '0',
      policy_status: decodePolicyStatus(pickValue(pdRec, ['FPolicyStatus', 'PolicyStatus'])),
      policy_qty: pickNumber(pdRec, ['FPolicyQty', 'PolicyQty']),
      use_policy: decodeUsePolicy(pickValue(pdRec, ['FUSEPOLICY', 'UsePolicy'])),
      is_defect_process: (() => {
        const v = pickValue(pdRec, ['FISDEFECTPROCESS', 'IsDefectProcess']);
        return v !== undefined ? Boolean(v) : undefined;
      })(),
      is_mrb_review: (() => {
        const v = pickValue(pdRec, ['FISMRBREVIEW', 'IsMrbReview']);
        return v !== undefined ? Boolean(v) : undefined;
      })(),
    };
  });

  // ════════════════════════════════════════
  // 检验项目
  // ════════════════════════════════════════
  const entryRec = entry as unknown as Record<string, unknown> | undefined;
  const itemDetailKey = findFieldInObj(entryRec, ['FItemDetail', 'ItemDetail', 'F_QM_IBITEMDETAIL', 'QM_IBITEMDETAIL', 'FItemdetail', 'fitemdetail']);
  const topItemDetailKey = findFieldInObj(billRec, ['FItemDetail', 'ItemDetail', 'F_QM_IBITEMDETAIL', 'QM_IBITEMDETAIL', 'FItemdetail', 'fitemdetail']);

  let itemDetails: InspectItemDetail[] =
    (itemDetailKey && entryRec ? (entryRec[itemDetailKey] as InspectItemDetail[]) : undefined) ??
    (topItemDetailKey ? (billRec[topItemDetailKey] as InspectItemDetail[]) : undefined) ??
    [];

  // 防御：如果找到的值不是数组（如 null / undefined），转为空数组
  if (!Array.isArray(itemDetails)) {
    itemDetails = [];
  }

  const items: ItemInfo[] = itemDetails.map((it) => {
    const itRec = it as unknown as Record<string, unknown>;

    // 分析方法：金蝶可能返回文字、编码或基础资料对象
    let analysisMethod = pickString(itRec, ['FAnalysisMethod', 'AnalysisMethod']);
    if (!analysisMethod) {
      const methodBase = pickBaseData(itRec, ['FAnalysisMethod', 'AnalysisMethod']);
      analysisMethod = methodBase.name || methodBase.number || '';
    }
    // 统一编码映射：1=定量, 2=定性, 3=其他（兼容文字和编码）
    const normalizedMethod = (() => {
      const m = analysisMethod.trim();
      if (m === '1' || m.includes('定量')) return '定量';
      if (m === '2' || m.includes('定性')) return '定性';
      if (m === '3' || m.includes('其他')) return '其他';
      return m;
    })();

    // 根据分析方法解析对应的检验值字段
    let inspectVal: string | undefined;
    if (normalizedMethod === '定量') {
      const numVal = pickNumber(itRec, ['FInspectValQ', 'InspectValQ']);
      inspectVal = numVal !== undefined ? String(numVal) : undefined;
    } else if (normalizedMethod === '定性') {
      inspectVal = extractInspectValB(itRec);
    } else if (normalizedMethod) {
      inspectVal = pickString(itRec, ['FInspectValT', 'InspectValT']);
    }
    // 回退兼容：如果专用字段未取到值，尝试旧字段 FInspectVal
    if (!inspectVal) {
      inspectVal = pickString(itRec, ['FInspectVal', 'InspectVal']);
    }

    // 检验项目名称：优先直接字段，其次从基础资料 FInspectItemId 中取 Name
    let itemName = pickString(itRec, ['FInspectItemName', 'InspectItemName', 'FINSPECTITEMNAME']);
    console.log('[convertBillToLocal] raw item keys:', Object.keys(itRec).slice(0, 20));
    console.log('[convertBillToLocal] FInspectItemName direct:', itemName);

    if (!itemName) {
      const itemBase = pickBaseData(itRec, ['FInspectItemId', 'FInspectItemID', 'InspectItemId', 'FINSPECTITEMID']);
      console.log('[convertBillToLocal] FInspectItemId baseData:', JSON.stringify(itemBase));
      itemName = itemBase.name || '';
    }
    // 再次回退：尝试 FInspectItemId 对象本身的 FName/FNAME/Name 字段
    if (!itemName) {
      const itemIdVal = pickValue(itRec, ['FInspectItemId', 'FInspectItemID', 'InspectItemId', 'FINSPECTITEMID']);
      console.log('[convertBillToLocal] FInspectItemId raw val type:', typeof itemIdVal);
      if (itemIdVal && typeof itemIdVal === 'object' && !Array.isArray(itemIdVal)) {
        const idObj = itemIdVal as Record<string, unknown>;
        itemName =
          (typeof idObj.FName === 'string' ? idObj.FName : undefined) ||
          (typeof idObj.FNAME === 'string' ? idObj.FNAME : undefined) ||
          (typeof idObj.Name === 'string' ? idObj.Name : undefined) ||
          (typeof idObj.name === 'string' ? idObj.name : undefined) ||
          '';
        console.log('[convertBillToLocal] FInspectItemId object name:', itemName);
      } else if (typeof itemIdVal === 'string') {
        // 如果 FInspectItemId 是字符串编码，尝试用它作为名称（兜底）
        itemName = itemIdVal;
        console.log('[convertBillToLocal] FInspectItemId string fallback:', itemName);
      }
    }
    // 最终兜底：尝试所有可能的名称字段
    if (!itemName) {
      itemName =
        pickString(itRec, ['FName', 'Name', 'FNAME', 'name']) ||
        pickString(itRec, ['FMaterialName', 'MaterialName']) ||
        '';
      console.log('[convertBillToLocal] final fallback name:', itemName);
    }

    return {
      detail_id: pickString(itRec, ['FDetailID', 'DetailID', 'Id']),
      item_id: pickBaseData(itRec, ['FInspectItemId', 'FInspectItemID', 'InspectItemId']).number || '',
      item_name: itemName,
      target_val: pickString(itRec, ['FTargetVal', 'TargetVal']),
      inspect_val: inspectVal,
      result: pickString(itRec, ['FInspectResult1', 'InspectResult1']),
      upper_limit: pickNumber(itRec, ['FUpperLimit', 'UpperLimit']),
      lower_limit: pickNumber(itRec, ['FLowerLimit', 'LowerLimit']),
      analysis_method: normalizedMethod,
      defect_level: pickString(itRec, ['FDefectLevel', 'DefectLevel']),
      inspect_standard: pickString(itRec, ['FInspectStandard', 'InspectStandard']),
    };
  });

  // ════════════════════════════════════════
  // 缺陷记录
  // ════════════════════════════════════════
  const entryDefectKey = entry
    ? findFieldInObj(entry as unknown as Record<string, unknown>, ['FDefectDetail', 'DefectDetail'])
    : undefined;
  const billDefectKey = findFieldInObj(billRec, ['FDefectDetail', 'DefectDetail']);
  const defectSource = entryDefectKey
    ? (entry as unknown as Record<string, unknown>)[entryDefectKey]
    : billDefectKey
      ? billRec[billDefectKey]
      : undefined;

  const defects: DefectInfo[] = (defectSource ? (defectSource as unknown[]) : []).map((d) => {
    const dRec = d as unknown as Record<string, unknown>;
    return {
      detail_id: pickString(dRec, ['Id', 'FDetailID', 'DetailID']),
      defect_type: decodeDefectType(pickValue(dRec, ['FDefectTypeId', 'DefectTypeId'])) || '',
      defect_qty: pickNumber(dRec, ['FDefectQty', 'DefectQty']) ?? 0,
      defect_reason: decodeDefectReason(pickValue(dRec, ['FDefectReasonId', 'DefectReasonId'])),
      defect_level: decodeDefectLevel(pickValue(dRec, ['FDefectLevel', 'DefectLevel'])) || '',
      defect_result: decodeDefectResult(pickValue(dRec, ['FDefectResultId', 'DefectResultId'])),
    };
  });

  return { order, material, decisions, items, defects };
}
