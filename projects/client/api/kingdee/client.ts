/**
 * 金蝶云星空专用 HTTP 客户端
 *
 * 特点：
 * - 管理 Cookie 会话（金蝶登录后通过 Cookie 保持会话，默认 20 分钟）
 * - 统一 URL 前缀拼接（服务器地址可在系统设置中修改，持久化到 AsyncStorage）
 * - 请求超时控制
 * - 响应状态码和 MsgCode 解析
 * - 自动识别会话丢失（MsgCode === 1）并抛出特定错误
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

/** 金蝶云星空默认服务器地址（用户未自定义时使用） */
export const DEFAULT_KINGDEE_BASE_URL = 'https://121.37.216.69';

const KINGDEE_BASE_URL_STORAGE_KEY = 'kingdee_base_url';

let kingdeeBaseUrl: string = DEFAULT_KINGDEE_BASE_URL;

/** 获取当前生效的金蝶服务器地址 */
export function getKingdeeBaseUrl(): string {
  return kingdeeBaseUrl;
}

/** 设置金蝶服务器地址（持久化到 AsyncStorage，立即生效） */
export async function setKingdeeBaseUrl(url: string): Promise<void> {
  const trimmed = url.trim().replace(/\/$/, '');
  kingdeeBaseUrl = trimmed || DEFAULT_KINGDEE_BASE_URL;
  await AsyncStorage.setItem(KINGDEE_BASE_URL_STORAGE_KEY, kingdeeBaseUrl);
}

/** 应用启动时从 AsyncStorage 恢复金蝶服务器地址 */
export async function initKingdeeBaseUrl(): Promise<void> {
  try {
    const saved = await AsyncStorage.getItem(KINGDEE_BASE_URL_STORAGE_KEY);
    if (saved) kingdeeBaseUrl = saved;
  } catch (error) {
    console.error('Failed to restore Kingdee base URL:', error);
  }
}

const REQUEST_TIMEOUT = 45000;

/** 金蝶接口服务名称 → 路径片段（对应 WebAPI 文档各功能接口） */
const SERVICE_URLS = {
  // 登录验证
  LoginBySign: 'Kingdee.BOS.WebApi.ServicesStub.AuthService.LoginBySign.common.kdsvc',
  ValidateUser: 'Kingdee.BOS.WebApi.ServicesStub.AuthService.ValidateUser.common.kdsvc',
  ValidateUser2: 'Kingdee.BOS.WebApi.ServicesStub.AuthService.ValidateUser2.common.kdsvc',
  Logout: 'Kingdee.BOS.WebApi.ServicesStub.AuthService.Logout.common.kdsvc',

  // 表单数据操作
  View: 'Kingdee.BOS.WebApi.ServicesStub.DynamicFormService.View.common.kdsvc',
  Save: 'Kingdee.BOS.WebApi.ServicesStub.DynamicFormService.Save.common.kdsvc',
  SaveData: 'Kingdee.BOS.WebApi.ServicesStub.DynamicFormService.SaveData.common.kdsvc',
  BatchSave: 'Kingdee.BOS.WebApi.ServicesStub.DynamicFormService.BatchSave.common.kdsvc',
  Submit: 'Kingdee.BOS.WebApi.ServicesStub.DynamicFormService.Submit.common.kdsvc',
  Audit: 'Kingdee.BOS.WebApi.ServicesStub.DynamicFormService.Audit.common.kdsvc',
  UnAudit: 'Kingdee.BOS.WebApi.ServicesStub.DynamicFormService.UnAudit.common.kdsvc',
  Delete: 'Kingdee.BOS.WebApi.ServicesStub.DynamicFormService.Delete.common.kdsvc',
  Draft: 'Kingdee.BOS.WebApi.ServicesStub.DynamicFormService.Draft.common.kdsvc',

  // 查询与报表
  BillQuery: 'Kingdee.BOS.WebApi.ServicesStub.DynamicFormService.BillQuery.common.kdsvc',
  GetSysReportData: 'Kingdee.BOS.WebApi.ServicesStub.DynamicFormService.GetSysReportData.common.kdsvc',

  // 下推与分配
  Push: 'Kingdee.BOS.WebApi.ServicesStub.DynamicFormService.Push.common.kdsvc',
  Allocate: 'Kingdee.BOS.WebApi.ServicesStub.DynamicFormService.Allocate.common.kdsvc',

  // 组织与审批
  SwitchOrg: 'Kingdee.BOS.WebApi.ServicesStub.DynamicFormService.SwitchOrg.common.kdsvc',
  WorkflowAudit: 'Kingdee.BOS.WebApi.ServicesStub.DynamicFormService.WorkflowAudit.common.kdsvc',

  // 附件与文件
  AttachmentUpLoad: 'Kingdee.BOS.WebApi.ServicesStub.DynamicFormService.AttachmentUpLoad.common.kdsvc',
  AttachmentDownLoad: 'Kingdee.BOS.WebApi.ServicesStub.DynamicFormService.AttachmentDownLoad.common.kdsvc',
  UpLoadFile: 'Kingdee.BOS.WebApi.ServicesStub.DynamicFormService.UpLoadFile.common.kdsvc',

  // 通用操作
  ExecuteOperation: 'Kingdee.BOS.WebApi.ServicesStub.DynamicFormService.ExecuteOperation.common.kdsvc',
};

export type KingdeeServiceName = keyof typeof SERVICE_URLS;

let sessionCookie: string | null = null;

/** 设置/更新会话 Cookie */
export function setKingdeeSessionCookie(cookie: string | null) {
  sessionCookie = cookie;
}

/** 获取当前会话 Cookie */
export function getKingdeeSessionCookie(): string | null {
  return sessionCookie;
}

/** 清除会话 Cookie */
export function clearKingdeeSession() {
  sessionCookie = null;
}

export function buildUrl(service: KingdeeServiceName): string {
  const path = SERVICE_URLS[service];
  return `${getKingdeeBaseUrl()}/K3Cloud/${path}`;
}

export async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(id);
  }
}

export function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as Record<string, unknown>).name === 'AbortError'
  );
}

export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('network') ||
      msg.includes('fetch') ||
      msg.includes('failed') ||
      msg.includes('ssl') ||
      msg.includes('certificate') ||
      msg.includes('timed out') ||
      msg.includes('timeout') ||
      msg.includes('connection') ||
      msg.includes('unreachable')
    );
  }
  if (isAbortError(error)) {
    return true;
  }
  return false;
}

export function getNetworkErrorMessage(error: unknown): string {
  const original = error instanceof Error ? error.message : String(error);

  // React Native 真机环境
  if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
    return `网络异常：${original || '无法连接到金蝶服务器'}`;
  }

  // TODO(临时协作开发 / LAN共享模式):
  // 当通过局域网内其他电脑以 Web 预览访问本机时（如 http://192.168.x.x:8083），
  // 浏览器向 https://121.37.216.69 发起的 fetch 请求仍会受到 CORS 同源策略限制。
  // 这是浏览器安全行为，与 LAN 共享配置无关。如需要测试金蝶 API 联调，请使用：
  //   1) React Native 真机/模拟器运行（无 CORS 限制），或
  //   2) 配置浏览器禁用 CORS（仅开发调试），或
  //   3) 搭建同域代理转发层。
  // 开发完成后请一并删除本段 TODO 注释。
  return `网络请求失败（${original || '无法连接到 121.37.216.69'}）。在浏览器中直接访问金蝶接口可能受跨域(CORS)限制，建议在真机或配置代理后测试。`;
}

/** 内部：执行请求并处理通用响应逻辑（Cookie、超时、MsgCode） */
async function executeRequest<T>(
  url: string,
  headers: Record<string, string>,
  bodyString: string
): Promise<T> {
  let res: Response;
  try {
    res = await fetchWithTimeout(url, {
      method: 'POST',
      headers,
      body: bodyString,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error('请求超时，请检查网络或金蝶服务器状态');
    }
    if (isNetworkError(error)) {
      throw new Error(getNetworkErrorMessage(error));
    }
    const original = error instanceof Error ? error.message : String(error);
    throw new Error(`请求失败：${original}`);
  }

  // 保存服务端返回的 Set-Cookie（会话保持）
  const setCookie = res.headers.get('Set-Cookie');
  if (setCookie) {
    const match = setCookie.match(/([^;]+)/);
    if (match) {
      sessionCookie = match[1];
    }
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  // 如果响应体为空但 HTTP 状态成功，返回空对象（部分金蝶接口返回 200 但无 body）
  if (body === null && res.ok) {
    body = {};
  }

  if (!res.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body && typeof (body as Record<string, unknown>).message === 'string'
        ? String((body as Record<string, unknown>).message)
        : `HTTP ${res.status}: ${res.statusText}`;
    throw new Error(message);
  }

  // 金蝶部分接口返回文本需二次解析（如登录）
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      // 保持字符串
    }
  }

  // 检查 MsgCode === 1（会话丢失）
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    let msgCode: unknown = 0;

    if ('MsgCode' in b && typeof b.MsgCode === 'number') {
      msgCode = b.MsgCode;
    } else if (
      'ResponseStatus' in b &&
      b.ResponseStatus &&
      typeof b.ResponseStatus === 'object' &&
      'MsgCode' in (b.ResponseStatus as Record<string, unknown>)
    ) {
      msgCode = (b.ResponseStatus as Record<string, unknown>).MsgCode;
    } else if (
      'Result' in b &&
      b.Result &&
      typeof b.Result === 'object'
    ) {
      const resultObj = b.Result as Record<string, unknown>;
      if ('MsgCode' in resultObj && typeof resultObj.MsgCode === 'number') {
        msgCode = resultObj.MsgCode;
      } else if (
        'ResponseStatus' in resultObj &&
        resultObj.ResponseStatus &&
        typeof resultObj.ResponseStatus === 'object' &&
        'MsgCode' in (resultObj.ResponseStatus as Record<string, unknown>)
      ) {
        msgCode = (resultObj.ResponseStatus as Record<string, unknown>).MsgCode;
      }
    }

    if (msgCode === 1) {
      clearKingdeeSession();
      throw new Error('SESSION_LOST');
    }
  }

  return body as T;
}

/**
 * 调用金蝶标准 WebAPI（参数以数组形式序列化）
 *
 * 各功能对应接口地址详见 @金蝶云星空WebAPI接口说明书_V6.0.md
 *
 * @param service 服务名称（对应文档中的不同功能接口）
 * @param params  参数数组（金蝶标准接口通常接受 object[]，第0个formid/数据，第1个data）
 */
export async function callKingdee<T>(
  service: KingdeeServiceName,
  params: unknown[]
): Promise<T> {
  if (!sessionCookie && service !== 'LoginBySign' && service !== 'ValidateUser2') {
    throw new Error('SESSION_LOST');
  }

  const url = buildUrl(service);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json;charset=UTF-8',
  };
  if (sessionCookie) {
    headers['Cookie'] = sessionCookie;
  }

  return executeRequest<T>(url, headers, JSON.stringify(params));
}

/**
 * 调用金蝶标准 WebAPI（直接发送对象 body，不包装成数组）
 *
 * 部分接口（如 BillQuery）要求请求体为 { data: {...} } 格式，
 * 而非 ["jsonString"] 数组格式，使用此函数。
 */
export async function callKingdeePost<T>(
  service: KingdeeServiceName,
  body: unknown
): Promise<T> {
  if (!sessionCookie && service !== 'LoginBySign' && service !== 'ValidateUser2') {
    throw new Error('SESSION_LOST');
  }

  const url = buildUrl(service);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json;charset=UTF-8',
  };
  if (sessionCookie) {
    headers['Cookie'] = sessionCookie;
  }

  return executeRequest<T>(url, headers, JSON.stringify(body));
}

/**
 * 单参数调用（如 LoginBySign 等只有一个 data 参数的接口）
 *
 * 根据金蝶文档，单参数接口的参数应为 JSON 字符串作为数组元素：
 *   ["{\\\"FormId\\\":\\\"...\\\"}"]
 * 因此如果传入的是对象，会先自动序列化为 JSON 字符串。
 */
export async function callKingdeeSingle<T>(
  service: KingdeeServiceName,
  data: unknown
): Promise<T> {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  return callKingdee<T>(service, [payload]);
}
