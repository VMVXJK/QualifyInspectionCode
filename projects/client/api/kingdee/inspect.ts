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
import { callKingdeePost } from './client';
import {
  mapDocumentStatus,
  autoJudge,
  resolveBaseData,
} from './utils';
import type {
  InspectBill,
  InspectBillEntry,
  InspectItemDetail,
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
 * - FDocumentStatus    单据状态 (Z=创建, A=待检, B=审批中, C=已完成)
 * - FMaterialId.FNumber/FName 分录物料编码/名称（单据体字段，直接用字段名.关联字段即可，无需 FEntity_ 前缀）
 *
 * 注意：
 * 1. BillQuery 返回的是对象数组 [{ FID: ..., FBILLNO: ... }, ...]，
 *    键名与 FieldKeys 完全一致（包括带点号的复合字段）。
 * 2. 基础资料字段不要超过 30 个（含多语言字段），当前 7 个字段安全。
 * 3. 查询一定要有查询条件并限定取数范围，防止接口超时。
 * 4. FMaterialId 是单据体（分录）字段，BillQuery 会按分录展开返回，
 *    同一张单据有多个分录时会对应多行——解析时按 FID 去重，只取首个分录的物料信息。
 */
const LIST_FIELD_KEYS = [
  'FID',
  'FBILLNO',
  'FDate',
  'FBILLTYPEID.FNumber',
  'FBILLTYPEID.FName',
  'FDocumentStatus',
  'FMaterialId.FNumber',
  'FMaterialId.FName',
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
      StartRow: params?.startRow ?? 0,
      Limit: params?.limit ?? 50,
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
  // 注意：FMaterialId 是单据体（分录）字段，一张单据有多个物料分录时 BillQuery 会展开成多行
  // （主表字段如 FID/FBILLNO 重复，物料字段不同），这里按 FID 聚合，只保留首个分录的物料信息，
  // 同时统计分录行数（material_count），供列表卡片展示"等N种"。
  const orderMap = new Map<string, OrderSummary>();
  const materialCountMap = new Map<string, number>();
  for (const row of rowsRaw!) {
    if (!Array.isArray(row)) {
      throw new Error('查询检验单失败：行格式异常（非数组）');
    }
    const id = String(row[0] ?? '');
    materialCountMap.set(id, (materialCountMap.get(id) ?? 0) + 1);
    if (orderMap.has(id)) continue;

    const typeId = String(row[3] ?? '');
    const typeNameFromKd = String(row[4] ?? '');
    orderMap.set(id, {
      id,
      order_no: String(row[1] ?? ''),
      date: String(row[2] ?? ''),
      type_id: typeId,
      type_name: typeNameFromKd || mapBillTypeName(typeId),
      document_status: String(row[5] ?? ''),
      status: mapDocumentStatus(String(row[5] ?? '')),
      type: typeNameFromKd || mapBillTypeName(typeId),
      material_code: row[6] ? String(row[6]) : undefined,
      material_name: row[7] ? String(row[7]) : undefined,
    });
  }

  const rows: OrderSummary[] = [...orderMap.values()].map((o) => ({
    ...o,
    material_count: materialCountMap.get(o.id) ?? 1,
  }));

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
 * 兜底查询：按单据内码从 BillQuery 补查物料编码/名称/规格型号
 *
 * 背景：View 接口是否带出分录物料的 FName/规格型号取决于金蝶后台该单据体字段的
 * 关联属性配置，部分环境下只返回内码；而 BillQuery 支持显式指定
 * FMaterialId.FNumber/FName/FMaterialModel，取数更可靠。详情页解析后若物料名称
 * 或规格型号为空，用此函数按 FID 单独补一次查询。
 */
export async function fetchMaterialInfoByBillId(
  billId: string
): Promise<{ material_code?: string; material_name?: string; material_model?: string; qc_scheme_code?: string; qc_scheme_name?: string } | undefined> {
  if (!billId) return undefined;

  const requestBody = {
    data: {
      FormId: FORM_ID,
      FieldKeys: 'FMaterialId.FNumber,FMaterialId.FName,FMaterialModel,FQCSchemeId.FNumber,FQCSchemeId.FName',
      FilterString: `FID = ${Number(billId)}`,
      OrderString: '',
      StartRow: 0,
      Limit: 1,
    },
  };

  let result: unknown;
  try {
    result = await callKingdeePost<unknown>('BillQuery', requestBody);
  } catch {
    return undefined;
  }

  const rows = parseBillQueryRows(result);
  const first = rows[0];
  if (!first) return undefined;

  if (Array.isArray(first)) {
    return {
      material_code: first[0] ? String(first[0]) : undefined,
      material_name: first[1] ? String(first[1]) : undefined,
      material_model: first[2] ? String(first[2]) : undefined,
      qc_scheme_code: first[3] ? String(first[3]) : undefined,
      qc_scheme_name: first[4] ? String(first[4]) : undefined,
    };
  }
  if (typeof first === 'object') {
    const rec = first as Record<string, unknown>;
    return {
      material_code: rec['FMaterialId.FNumber'] ? String(rec['FMaterialId.FNumber']) : undefined,
      material_name: rec['FMaterialId.FName'] ? String(rec['FMaterialId.FName']) : undefined,
      material_model: rec['FMaterialModel'] ? String(rec['FMaterialModel']) : undefined,
      qc_scheme_code: rec['FQCSchemeId.FNumber'] ? String(rec['FQCSchemeId.FNumber']) : undefined,
      qc_scheme_name: rec['FQCSchemeId.FName'] ? String(rec['FQCSchemeId.FName']) : undefined,
    };
  }
  return undefined;
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

/* ════════════════════════════════════════
   1b. 查询质检方案详情（View → 检验项目表体）
   ════════════════════════════════════════ */

export interface QCSchemeItem {
  item_code: string;
  item_name: string;
  analysis_method: string;
  target_val?: string;
  upper_limit?: string;
  lower_limit?: string;
  method_code?: string;
  method_name?: string;
  instrument_code?: string;
  instrument_name?: string;
  quality_std_code?: string;
  quality_std_name?: string;
}

/**
 * 查询质检方案（QM_QCScheme）的检验项目表体
 * 选中方案后调用，返回该方案下所有检验项目供填入检验单分录
 */
export async function viewQCScheme(number: string): Promise<QCSchemeItem[]> {
  const requestBody = {
    formid: 'QM_QCScheme',
    data: {
      CreateOrgId: 0,
      Number: number,
      Id: '',
      IsSortBySeq: 'false',
    },
  };

  const result = await callKingdeePost<unknown>('View', requestBody);
  const scheme = extractViewResult<Record<string, unknown>>(result);

  const entityArr = (scheme.Entity || scheme.FEntity) as unknown[];
  if (!Array.isArray(entityArr) || entityArr.length === 0) return [];

  return entityArr.map((row) => {
    const r = row as Record<string, unknown>;

    const itemBase = resolveBaseData(r.InspectItemId);
    const methodBase = resolveBaseData(r.InspectMethodId);
    const instrumentBase = resolveBaseData(r.InspectInstrumentId);
    const qualityStdBase = resolveBaseData(r.QualityStdId);

    // 分析方法编码：1=定量, 2=定性, 3=其他
    const analysisRaw = String(r.AnalysisMethod ?? '');
    const analysisMethod =
      analysisRaw === '1' ? '定量' :
      analysisRaw === '2' ? '定性' :
      analysisRaw === '3' ? '其他' :
      analysisRaw;

    // 按分析方法取对应的目标值/上下限字段
    let targetVal: string | undefined;
    let upperLimit: string | undefined;
    let lowerLimit: string | undefined;

    if (analysisRaw === '1') {
      // 定量：数值字段
      const tv = r.TargetValQ !== undefined && r.TargetValQ !== null ? String(r.TargetValQ) : undefined;
      const uv = r.UpLimitQ !== undefined && r.UpLimitQ !== null ? String(r.UpLimitQ) : undefined;
      const lv = r.DownLimitQ !== undefined && r.DownLimitQ !== null ? String(r.DownLimitQ) : undefined;
      targetVal = tv && tv !== '0' ? tv : undefined;
      upperLimit = uv && uv !== '0' ? uv : undefined;
      lowerLimit = lv && lv !== '0' ? lv : undefined;
    } else if (analysisRaw === '2') {
      // 定性：基础资料对象
      const targetB = resolveBaseData(r.TargetValB);
      targetVal = targetB.name || targetB.number;
    } else {
      // 其他：文本字段
      targetVal = r.TargetValT ? String(r.TargetValT) : undefined;
    }

    // 兜底：尝试通用 TargetVal 文本字段
    if (!targetVal) {
      targetVal = r.TargetVal ? String(r.TargetVal) : undefined;
    }
    if (!upperLimit) {
      upperLimit = r.UpLimit ? String(r.UpLimit) : undefined;
    }
    if (!lowerLimit) {
      lowerLimit = r.DownLimit ? String(r.DownLimit) : undefined;
    }

    return {
      item_code: itemBase.number || '',
      item_name: itemBase.name || '',
      analysis_method: analysisMethod,
      target_val: targetVal,
      upper_limit: upperLimit,
      lower_limit: lowerLimit,
      method_code: methodBase.number,
      method_name: methodBase.name,
      instrument_code: instrumentBase.number,
      instrument_name: instrumentBase.name,
      quality_std_code: qualityStdBase.number,
      quality_std_name: qualityStdBase.name,
    };
  }).filter((it) => it.item_code);
}



/* ════════════════════════════════════════
   2. 同步检验方法映射表（BillQuery → AsyncStorage）
   ════════════════════════════════════════ */

const METHOD_MAP_STORAGE_KEY = '__sync_inspect_method_map';
const QM_INSPECT_METHOD_FORM_ID = 'QM_InspectMethod';
const METHOD_FIELD_KEYS = ['FNumber', 'FName'].join(',');

export interface SyncDiagnostics {
  request: unknown;
  response: unknown;
  error?: string;
}

/**
 * 从金蝶 BillQuery 拉取检验方法基础资料（编码+名称）
 * 并持久化到 AsyncStorage，供 getInspectMethodName 动态使用
 *
 * @returns success 是否成功；count 同步条数；diagnostics 诊断信息
 */
export async function syncInspectMethods(): Promise<{
  success: boolean;
  count: number;
  diagnostics: SyncDiagnostics;
}> {
  const requestBody = {
    data: {
      FormId: QM_INSPECT_METHOD_FORM_ID,
      FieldKeys: METHOD_FIELD_KEYS,
      FilterString: '',
      OrderString: 'FNumber',
      StartRow: 0,
      Limit: 2000,
    },
  };

  let result: unknown;
  let responseError: string | undefined;

  try {
    result = await callKingdeePost<unknown>('BillQuery', requestBody);
  } catch (err) {
    responseError = err instanceof Error ? err.message : '同步检验方法请求失败';
    return {
      success: false,
      count: 0,
      diagnostics: { request: requestBody, response: null, error: responseError },
    };
  }

  const rows = parseBillQueryRows(result);
  const map: Record<string, string> = {};

  for (const row of rows) {
    let code: string | undefined;
    let name: string | undefined;

    if (Array.isArray(row)) {
      code = String(row[0] ?? '');
      name = String(row[1] ?? '');
    } else if (row && typeof row === 'object') {
      const rec = row as Record<string, unknown>;
      code = String(rec.FNumber ?? rec.FNUMBER ?? rec.fnumber ?? '');
      name = String(rec.FName ?? rec.FNAME ?? rec.fname ?? '');
    }

    if (code && name) {
      map[code] = name;
    }
  }

  const count = Object.keys(map).length;

  if (count === 0) {
    return {
      success: false,
      count: 0,
      diagnostics: {
        request: requestBody,
        response: result,
        error: '未从金蝶获取到任何检验方法数据（返回为空或格式异常）',
      },
    };
  }

  try {
    await AsyncStorage.setItem(METHOD_MAP_STORAGE_KEY, JSON.stringify(map));
  } catch (storageErr) {
    const msg = storageErr instanceof Error ? storageErr.message : '保存映射表到本地存储失败';
    return {
      success: false,
      count,
      diagnostics: { request: requestBody, response: result, error: msg },
    };
  }

  return {
    success: true,
    count,
    diagnostics: { request: requestBody, response: result },
  };
}

/** 从 AsyncStorage 读取已同步的检验方法映射表 */
export async function loadInspectMethodMapFromStorage(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(METHOD_MAP_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, string>;
      }
    }
  } catch {
    /* ignore */
  }
  return {};
}

/* ════════════════════════════════════════
   5. 同步检验项目映射表（BillQuery → AsyncStorage）
   ════════════════════════════════════════ */

const ITEM_MAP_STORAGE_KEY = '__sync_inspect_item_map';
const QM_INSPECT_ITEM_FORM_ID = 'QM_InspectItem';
const ITEM_FIELD_KEYS = ['FNumber', 'FName'].join(',');

/**
 * 从金蝶 BillQuery 拉取检验项目基础资料（编码+名称）
 * 并持久化到 AsyncStorage，供 getInspectItemName 动态使用
 */
export async function syncInspectItems(): Promise<{
  success: boolean;
  count: number;
  diagnostics: SyncDiagnostics;
}> {
  const requestBody = {
    data: {
      FormId: QM_INSPECT_ITEM_FORM_ID,
      FieldKeys: ITEM_FIELD_KEYS,
      FilterString: '',
      OrderString: 'FNumber',
      StartRow: 0,
      Limit: 2000,
    },
  };

  let result: unknown;
  let responseError: string | undefined;

  try {
    result = await callKingdeePost<unknown>('BillQuery', requestBody);
  } catch (err) {
    responseError = err instanceof Error ? err.message : '同步检验项目请求失败';
    return {
      success: false,
      count: 0,
      diagnostics: { request: requestBody, response: null, error: responseError },
    };
  }

  const rows = parseBillQueryRows(result);
  const map: Record<string, string> = {};

  for (const row of rows) {
    let code: string | undefined;
    let name: string | undefined;

    if (Array.isArray(row)) {
      code = String(row[0] ?? '');
      name = String(row[1] ?? '');
    } else if (row && typeof row === 'object') {
      const rec = row as Record<string, unknown>;
      code = String(rec.FNumber ?? rec.FNUMBER ?? rec.fnumber ?? '');
      name = String(rec.FName ?? rec.FNAME ?? rec.fname ?? '');
    }

    if (code && name) {
      map[code] = name;
    }
  }

  const count = Object.keys(map).length;

  if (count === 0) {
    return {
      success: false,
      count: 0,
      diagnostics: {
        request: requestBody,
        response: result,
        error: '未从金蝶获取到任何检验项目数据（返回为空或格式异常）',
      },
    };
  }

  try {
    await AsyncStorage.setItem(ITEM_MAP_STORAGE_KEY, JSON.stringify(map));
  } catch (storageErr) {
    const msg = storageErr instanceof Error ? storageErr.message : '保存映射表到本地存储失败';
    return {
      success: false,
      count,
      diagnostics: { request: requestBody, response: result, error: msg },
    };
  }

  return {
    success: true,
    count,
    diagnostics: { request: requestBody, response: result },
  };
}

/** 从 AsyncStorage 读取已同步的检验项目映射表 */
export async function loadInspectItemMapFromStorage(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(ITEM_MAP_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, string>;
      }
    }
  } catch {
    /* ignore */
  }
  return {};
}

/* ════════════════════════════════════════
   6. 同步检验仪器映射表（BillQuery → AsyncStorage）
   ════════════════════════════════════════ */

const INSTRUMENT_MAP_STORAGE_KEY = '__sync_inspect_instrument_map';
const QM_INSPECT_INSTRUMENT_FORM_ID = 'QM_InspectInstrument';
const INSTRUMENT_FIELD_KEYS = ['FNumber', 'FName'].join(',');

/**
 * 从金蝶 BillQuery 拉取检验仪器基础资料（编码+名称）
 * 并持久化到 AsyncStorage，供 getInspectInstrumentName 动态使用
 */
export async function syncInspectInstruments(): Promise<{
  success: boolean;
  count: number;
  diagnostics: SyncDiagnostics;
}> {
  const requestBody = {
    data: {
      FormId: QM_INSPECT_INSTRUMENT_FORM_ID,
      FieldKeys: INSTRUMENT_FIELD_KEYS,
      FilterString: '',
      OrderString: 'FNumber',
      StartRow: 0,
      Limit: 2000,
    },
  };

  let result: unknown;
  let responseError: string | undefined;

  try {
    result = await callKingdeePost<unknown>('BillQuery', requestBody);
  } catch (err) {
    responseError = err instanceof Error ? err.message : '同步检验仪器请求失败';
    return {
      success: false,
      count: 0,
      diagnostics: { request: requestBody, response: null, error: responseError },
    };
  }

  const rows = parseBillQueryRows(result);
  const map: Record<string, string> = {};

  for (const row of rows) {
    let code: string | undefined;
    let name: string | undefined;

    if (Array.isArray(row)) {
      code = String(row[0] ?? '');
      name = String(row[1] ?? '');
    } else if (row && typeof row === 'object') {
      const rec = row as Record<string, unknown>;
      code = String(rec.FNumber ?? rec.FNUMBER ?? rec.fnumber ?? '');
      name = String(rec.FName ?? rec.FNAME ?? rec.fname ?? '');
    }

    if (code && name) {
      map[code] = name;
    }
  }

  const count = Object.keys(map).length;

  if (count === 0) {
    return {
      success: false,
      count: 0,
      diagnostics: {
        request: requestBody,
        response: result,
        error: '未从金蝶获取到任何检验仪器数据（返回为空或格式异常）',
      },
    };
  }

  try {
    await AsyncStorage.setItem(INSTRUMENT_MAP_STORAGE_KEY, JSON.stringify(map));
  } catch (storageErr) {
    const msg = storageErr instanceof Error ? storageErr.message : '保存映射表到本地存储失败';
    return {
      success: false,
      count,
      diagnostics: { request: requestBody, response: result, error: msg },
    };
  }

  return {
    success: true,
    count,
    diagnostics: { request: requestBody, response: result },
  };
}

/** 从 AsyncStorage 读取已同步的检验仪器映射表 */
export async function loadInspectInstrumentMapFromStorage(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(INSTRUMENT_MAP_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, string>;
      }
    }
  } catch {
    /* ignore */
  }
  return {};
}

/* ════════════════════════════════════════
   7. 同步检测值映射表（BillQuery → AsyncStorage）
   ════════════════════════════════════════ */

const VALUE_MAP_STORAGE_KEY = '__sync_inspect_value_map';
const QM_INSPECT_VALUE_FORM_ID = 'QM_InspectValue';
const VALUE_FIELD_KEYS = ['FNumber', 'FName'].join(',');

/**
 * 从金蝶 BillQuery 拉取检测值基础资料（编码+名称）
 * 并持久化到 AsyncStorage，供 getQualitativeText 动态使用
 */
export async function syncInspectValueOptions(): Promise<{
  success: boolean;
  count: number;
  diagnostics: SyncDiagnostics;
}> {
  const requestBody = {
    data: {
      FormId: QM_INSPECT_VALUE_FORM_ID,
      FieldKeys: VALUE_FIELD_KEYS,
      FilterString: '',
      OrderString: 'FNumber',
      StartRow: 0,
      Limit: 2000,
    },
  };

  let result: unknown;
  let responseError: string | undefined;

  try {
    result = await callKingdeePost<unknown>('BillQuery', requestBody);
  } catch (err) {
    responseError = err instanceof Error ? err.message : '同步检测值请求失败';
    return {
      success: false,
      count: 0,
      diagnostics: { request: requestBody, response: null, error: responseError },
    };
  }

  const rows = parseBillQueryRows(result);
  const map: Record<string, string> = {};

  for (const row of rows) {
    let code: string | undefined;
    let name: string | undefined;

    if (Array.isArray(row)) {
      code = String(row[0] ?? '');
      name = String(row[1] ?? '');
    } else if (row && typeof row === 'object') {
      const rec = row as Record<string, unknown>;
      code = String(rec.FNumber ?? rec.FNUMBER ?? rec.fnumber ?? '');
      name = String(rec.FName ?? rec.FNAME ?? rec.fname ?? '');
    }

    if (code && name) {
      map[code] = name;
    }
  }

  const count = Object.keys(map).length;

  if (count === 0) {
    return {
      success: false,
      count: 0,
      diagnostics: {
        request: requestBody,
        response: result,
        error: '未从金蝶获取到任何检测值数据（返回为空或格式异常）',
      },
    };
  }

  try {
    await AsyncStorage.setItem(VALUE_MAP_STORAGE_KEY, JSON.stringify(map));
  } catch (storageErr) {
    const msg = storageErr instanceof Error ? storageErr.message : '保存映射表到本地存储失败';
    return {
      success: false,
      count,
      diagnostics: { request: requestBody, response: result, error: msg },
    };
  }

  return {
    success: true,
    count,
    diagnostics: { request: requestBody, response: result },
  };
}

/** 从 AsyncStorage 读取已同步的检测值映射表 */
export async function loadInspectValueMapFromStorage(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(VALUE_MAP_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, string>;
      }
    }
  } catch {
    /* ignore */
  }
  return {};
}

/* ════════════════════════════════════════
   8. 同步单据类型映射表（BillQuery → AsyncStorage）
   ════════════════════════════════════════ */

const BILL_TYPE_MAP_STORAGE_KEY = '__sync_bill_type_map';
const BOS_BILL_TYPE_FORM_ID = 'BOS_BillType';
const BILL_TYPE_FIELD_KEYS = ['FNumber', 'FName'].join(',');

/**
 * 从金蝶 BillQuery 拉取单据类型基础资料（编码+名称）
 * 筛选编码包含 "JYD" 的单据类型，并持久化到 AsyncStorage
 */
export async function syncBillTypes(): Promise<{
  success: boolean;
  count: number;
  diagnostics: SyncDiagnostics;
}> {
  const requestBody = {
    data: {
      FormId: BOS_BILL_TYPE_FORM_ID,
      FieldKeys: BILL_TYPE_FIELD_KEYS,
      FilterString: "FNumber like '%JYD%'",
      OrderString: 'FNumber',
      StartRow: 0,
      Limit: 2000,
    },
  };

  let result: unknown;
  let responseError: string | undefined;

  try {
    result = await callKingdeePost<unknown>('BillQuery', requestBody);
  } catch (err) {
    responseError = err instanceof Error ? err.message : '同步单据类型请求失败';
    return {
      success: false,
      count: 0,
      diagnostics: { request: requestBody, response: null, error: responseError },
    };
  }

  const rows = parseBillQueryRows(result);
  const map: Record<string, string> = {};

  for (const row of rows) {
    let code: string | undefined;
    let name: string | undefined;

    if (Array.isArray(row)) {
      code = String(row[0] ?? '');
      name = String(row[1] ?? '');
    } else if (row && typeof row === 'object') {
      const rec = row as Record<string, unknown>;
      code = String(rec.FNumber ?? rec.FNUMBER ?? rec.fnumber ?? '');
      name = String(rec.FName ?? rec.FNAME ?? rec.fname ?? '');
    }

    if (code && name) {
      map[code] = name;
    }
  }

  const count = Object.keys(map).length;

  if (count === 0) {
    return {
      success: false,
      count: 0,
      diagnostics: {
        request: requestBody,
        response: result,
        error: '未从金蝶获取到任何单据类型数据（返回为空或格式异常）',
      },
    };
  }

  try {
    await AsyncStorage.setItem(BILL_TYPE_MAP_STORAGE_KEY, JSON.stringify(map));
  } catch (storageErr) {
    const msg = storageErr instanceof Error ? storageErr.message : '保存映射表到本地存储失败';
    return {
      success: false,
      count,
      diagnostics: { request: requestBody, response: result, error: msg },
    };
  }

  return {
    success: true,
    count,
    diagnostics: { request: requestBody, response: result },
  };
}

/** 从 AsyncStorage 读取已同步的单据类型映射表 */
export async function loadBillTypeMapFromStorage(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(BILL_TYPE_MAP_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, string>;
      }
    }
  } catch {
    /* ignore */
  }
  return {};
}

/* ════════════════════════════════════════
   9. 同步质检方案映射表（BillQuery → AsyncStorage）
   ════════════════════════════════════════ */

const QC_SCHEME_MAP_STORAGE_KEY = '__sync_qc_scheme_map';
const QM_QCSCHEME_FORM_ID = 'QM_QCScheme';
const QC_SCHEME_FIELD_KEYS = ['FNumber', 'FName'].join(',');

/**
 * 从金蝶 BillQuery 拉取质检方案基础资料（编码+名称）
 * 并持久化到 AsyncStorage，供 getQCSchemeName 动态使用
 */
export async function syncQCSchemes(): Promise<{
  success: boolean;
  count: number;
  diagnostics: SyncDiagnostics;
}> {
  const requestBody = {
    data: {
      FormId: QM_QCSCHEME_FORM_ID,
      FieldKeys: QC_SCHEME_FIELD_KEYS,
      FilterString: '',
      OrderString: 'FNumber',
      StartRow: 0,
      Limit: 2000,
    },
  };

  let result: unknown;
  let responseError: string | undefined;

  try {
    result = await callKingdeePost<unknown>('BillQuery', requestBody);
  } catch (err) {
    responseError = err instanceof Error ? err.message : '同步质检方案请求失败';
    return {
      success: false,
      count: 0,
      diagnostics: { request: requestBody, response: null, error: responseError },
    };
  }

  const rows = parseBillQueryRows(result);
  const map: Record<string, string> = {};

  for (const row of rows) {
    let code: string | undefined;
    let name: string | undefined;

    if (Array.isArray(row)) {
      code = String(row[0] ?? '');
      name = String(row[1] ?? '');
    } else if (row && typeof row === 'object') {
      const rec = row as Record<string, unknown>;
      code = String(rec.FNumber ?? rec.FNUMBER ?? rec.fnumber ?? '');
      name = String(rec.FName ?? rec.FNAME ?? rec.fname ?? '');
    }

    if (code && name) {
      map[code] = name;
    }
  }

  const count = Object.keys(map).length;

  if (count === 0) {
    return {
      success: false,
      count: 0,
      diagnostics: {
        request: requestBody,
        response: result,
        error: '未从金蝶获取到任何质检方案数据（返回为空或格式异常）',
      },
    };
  }

  try {
    await AsyncStorage.setItem(QC_SCHEME_MAP_STORAGE_KEY, JSON.stringify(map));
  } catch (storageErr) {
    const msg = storageErr instanceof Error ? storageErr.message : '保存映射表到本地存储失败';
    return {
      success: false,
      count,
      diagnostics: { request: requestBody, response: result, error: msg },
    };
  }

  return {
    success: true,
    count,
    diagnostics: { request: requestBody, response: result },
  };
}

/** 从 AsyncStorage 读取已同步的质检方案映射表 */
export async function loadQCSchemeMapFromStorage(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(QC_SCHEME_MAP_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, string>;
      }
    }
  } catch {
    /* ignore */
  }
  return {};
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
  qcSchemeCode?: string; // 本次选中的质检方案编码（若有则回传至 FQCSchemeId）
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
  const { billId, inspector, billResult, entryId, items, defects, decisions, rawBill, qcSchemeCode } = params;

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

  // 若本次选中了质检方案，回传至分录的 FQCSchemeId 字段
  if (qcSchemeCode) {
    modelEntry.FQCSchemeId = { FNUMBER: qcSchemeCode };
  }

  // 3.1 检验项目（FItemDetail）
  if (items && items.length > 0) {
    modelEntry.FItemDetail = items.map((it) => {
      const detailId = it.detail_id ?? '0';

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

      // 回传检验方法、检验仪器、质量标准编码（仅当 ItemInfo 携带对应编码时）
      if (it.method_code) detail.FInspectMethodId = { FNUMBER: it.method_code };
      if (it.instrument_code) detail.FInspectInstrumentId = { FNUMBER: it.instrument_code };
      if (it.quality_std_code) detail.FQualityStdId = { FNUMBER: it.quality_std_code };

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
  if (inspector) {
    model.FInspectorId = { FNumber: inspector };
  }

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
  const requestBody = {
    formid: FORM_ID,
    data: {
      CreateOrgId: orgId ?? 0,
      Numbers: numbers,
      Ids: '',
      IgnoreInterationFlag: '',
      NetworkCtrl: '',
      SelectedPostId: 0,
      UseOrgId: 0,
    },
  };

  const result = await callKingdeePost<{
    Result: { ResponseStatus: KingdeeResponseStatus };
    ResponseStatus: KingdeeResponseStatus;
  }>('Submit', requestBody);

  const status = result.Result?.ResponseStatus ?? result.ResponseStatus;
  if (!status.IsSuccess) {
    const err = status.Errors?.[0];
    throw new Error(err?.Message || '提交检验单失败');
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

import { BILL_TYPE_NAME_MAP } from '@/screens/order-detail/data/bill-type-map';

function mapBillTypeName(typeId: unknown): string {
  const id = String(typeId ?? '');
  // 1. 优先使用统一维护的映射表
  if (BILL_TYPE_NAME_MAP[id]) return BILL_TYPE_NAME_MAP[id];
  // 2. 回退到包含匹配兜底
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
function pickBaseData(obj: Record<string, unknown>, candidates: string[]): { number?: string; name?: string; specification?: string } {
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
  const qcSchemeBase = pickBaseData(matRec, ['FQCSchemeId', 'FQCSCHEMEID', 'QCSchemeId']);

  const material: MaterialInfo | undefined = materialSource
    ? {
        entry_id: pickString(matRec, ['FEntryID', 'FEntryId', 'EntryId']) || '',
        material_code: matBase.number || '',
        material_name:
          matBase.name || pickString(matRec, ['FMaterialName', 'MaterialName']) || '',
        material_model:
          matBase.specification || pickString(matRec, ['FMaterialModel', 'MaterialModel']),
        unit: unitBase.number || '',
        inspect_qty: pickNumber(matRec, ['FINSPECTQTY', 'FInspectQty', 'InspectQty']) ?? 0,
        qualified_qty: pickNumber(matRec, ['FQualifiedQty', 'QualifiedQty']),
        unqualified_qty: pickNumber(matRec, ['FUnQualifiedQty', 'UnQualifiedQty']),
        inspect_result: pickBaseData(matRec, ['FInspectResult', 'InspectResult']).name,
        qc_scheme_code: qcSchemeBase.number,
        qc_scheme_name: qcSchemeBase.name,
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

    if (!itemName) {
      const itemBase = pickBaseData(itRec, ['FInspectItemId', 'FInspectItemID', 'InspectItemId', 'FINSPECTITEMID']);
      itemName = itemBase.name || '';
    }
    // 再次回退：尝试 FInspectItemId 对象本身的 FName/FNAME/Name 字段
    if (!itemName) {
      const itemIdVal = pickValue(itRec, ['FInspectItemId', 'FInspectItemID', 'InspectItemId', 'FINSPECTITEMID']);
      if (itemIdVal && typeof itemIdVal === 'object' && !Array.isArray(itemIdVal)) {
        const idObj = itemIdVal as Record<string, unknown>;
        itemName =
          (typeof idObj.FName === 'string' ? idObj.FName : undefined) ||
          (typeof idObj.FNAME === 'string' ? idObj.FNAME : undefined) ||
          (typeof idObj.Name === 'string' ? idObj.Name : undefined) ||
          (typeof idObj.name === 'string' ? idObj.name : undefined) ||
          '';
      } else if (typeof itemIdVal === 'string') {
        // 如果 FInspectItemId 是字符串编码，尝试用它作为名称（兜底）
        itemName = itemIdVal;
      }
    }
    // 最终兜底：尝试所有可能的名称字段
    if (!itemName) {
      itemName =
        pickString(itRec, ['FName', 'Name', 'FNAME', 'name']) ||
        pickString(itRec, ['FMaterialName', 'MaterialName']) ||
        '';
    }

    // 检验方法 & 检验仪器（基础资料对象，取名称）
    const methodBase = pickBaseData(itRec, ['FInspectMethodId', 'FINSPECTMETHODID', 'InspectMethodId']);
    const instrumentBase = pickBaseData(itRec, ['FInspectInstrumentId', 'FINSPECTINSTRUMENTID', 'InspectInstrumentId']);

    // 检验项目里的检验结果（FInspectResult1）：1=合格, 2=不合格
    const result1Code = pickString(itRec, ['FInspectResult1', 'InspectResult1']);
    const inspectResult1 = result1Code === '2' ? '不合格' : result1Code === '1' ? '合格' : result1Code || '';

    // 检验项目里的缺陷等级（FDefectLevel1）
    const defectLevel1Raw = pickValue(itRec, ['FDefectLevel1', 'DefectLevel1', 'FDEFECTLEVEL1']);
    const defectLevel1 = decodeDefectLevel(defectLevel1Raw) || '';

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
      inspect_result1: inspectResult1,
      inspect_method_name: methodBase.name || methodBase.number,
      inspect_instrument_name: instrumentBase.name || instrumentBase.number,
      defect_level1: defectLevel1,
      method_code: methodBase.number,
      instrument_code: instrumentBase.number,
      quality_std_code: pickBaseData(itRec, ['FQualityStdId', 'FQUALITYSTDID', 'QualityStdId']).number,
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
