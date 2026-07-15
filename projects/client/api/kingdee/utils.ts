import * as Crypto from 'expo-crypto';

/**
 * 金蝶云星空工具函数
 */

/** 生成当前时间戳（秒级） */
export function getTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * 生成 SHA256 签名
 * 金蝶规则：将账套ID、用户名、应用ID、应用秘钥、时间戳放到数组，排序后拼接，SHA256加密
 */
export async function generateSign(params: {
  acctId: string;
  userName: string;
  appId: string;
  appSecret: string;
  timestamp: number;
}): Promise<string> {
  const { acctId, userName, appId, appSecret, timestamp } = params;
  const arr = [acctId, userName, appId, appSecret, String(timestamp)];
  arr.sort((a, b) => a.localeCompare(b));
  const raw = arr.join('');

  // Expo 环境使用 expo-crypto，若不可用则回退到 js-sha256 或 Web Crypto
  try {
    const digest = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      raw
    );
    return digest.toLowerCase();
  } catch {
    // Fallback：尝试 Web Crypto
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(raw);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').toLowerCase();
    }
    throw new Error('SHA256 计算不可用，请确保 expo-crypto 已安装');
  }
}

/** 将对象序列化为金蝶标准 JSON 字符串（用于接口参数） */
export function toKdJson(obj: unknown): string {
  return JSON.stringify(obj);
}

/** 金蝶单据状态 → APP 状态映射
 * 业务规则：Z(创建)/A(审核中)=待检, B(已审核)=审核中, C(重新审核)=已审核
 */
export function mapDocumentStatus(docStatus: string): string {
  switch (docStatus) {
    case 'Z':
    case 'A':
      return 'pending'; // 创建/审核中 = 待检
    case 'B':
      return 'inspecting'; // 已审核 = 审核中
    case 'C':
      return 'completed'; // 重新审核 = 已审核
    default:
      return 'pending';
  }
}

/** APP 状态标签 → 金蝶状态（如需回写） */
export function toKdDocumentStatus(status: string): string {
  switch (status) {
    case 'pending':
      return 'Z';
    case 'inspecting':
      return 'B';
    case 'completed':
      return 'C';
    default:
      return 'Z';
  }
}

/** 自动判定检测值是否合格 */
export function autoJudge(
  testValue: string | number | undefined,
  upperLimit?: number | string,
  lowerLimit?: number | string
): '合格' | '不合格' | '待检' {
  if (testValue === undefined || testValue === null || testValue === '') {
    return '待检';
  }
  const val = typeof testValue === 'string' ? parseFloat(testValue) : testValue;
  if (isNaN(val)) {
    // 非数值类型（如目视检验），有值即合格（或根据业务扩展）
    return String(testValue).trim() ? '合格' : '待检';
  }
  const upper = upperLimit !== undefined ? Number(upperLimit) : undefined;
  const lower = lowerLimit !== undefined ? Number(lowerLimit) : undefined;

  if (upper !== undefined && val > upper) return '不合格';
  if (lower !== undefined && val < lower) return '不合格';
  return '合格';
}

/** 格式化日期为金蝶接受的字符串（yyyy/MM/dd 或 ISO） */
export function formatKdDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

/** 解析金蝶基础资料对象，兼容两种格式：
 * - View API 格式：{ Id, Number, Name }
 * - BillQuery/Legacy 格式：{ FNumber, FName }
 * - 多语言 Name：{ zh_CN: 'xxx', en_US: 'xxx' }
 */
export function resolveBaseData(val: unknown): { number?: string; name?: string } {
  if (!val || typeof val !== 'object') return {};
  const obj = val as Record<string, unknown>;

  // 号码：兼容 FNumber / FNUMBER / Number / number
  const number =
    (typeof obj.FNumber === 'string' ? obj.FNumber : undefined) ||
    (typeof obj.FNUMBER === 'string' ? obj.FNUMBER : undefined) ||
    (typeof obj.Number === 'string' ? obj.Number : undefined) ||
    (typeof obj.number === 'string' ? obj.number : undefined);

  // 名称：兼容 FName / FNAME / Name / name
  let name =
    (typeof obj.FName === 'string' ? obj.FName : undefined) ||
    (typeof obj.FNAME === 'string' ? obj.FNAME : undefined) ||
    (typeof obj.Name === 'string' ? obj.Name : undefined) ||
    (typeof obj.name === 'string' ? obj.name : undefined);

  // 处理多语言 Name 对象（如 { zh_CN: "中文名", en_US: "English Name" }）
  if (!name && obj.Name && typeof obj.Name === 'object' && !Array.isArray(obj.Name)) {
    const nameObj = obj.Name as Record<string, unknown>;
    name =
      (typeof nameObj.zh_CN === 'string' ? nameObj.zh_CN : undefined) ||
      (typeof nameObj.en_US === 'string' ? nameObj.en_US : undefined) ||
      (typeof nameObj['zh-CN'] === 'string' ? nameObj['zh-CN'] : undefined) ||
      (typeof nameObj['en-US'] === 'string' ? nameObj['en-US'] : undefined);
  }

  return { number, name };
}

/** 从对象中安全读取字符串值，兼容两种字段名（大写/驼峰/不区分大小写） */
export function resolveString(
  obj: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  // 先精确匹配
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === 'string') return val;
    if (typeof val === 'number') return String(val);
  }
  // 再不区分大小写匹配
  const lowerMap = Object.fromEntries(
    Object.keys(obj).map((k) => [k.toLowerCase(), k])
  );
  for (const key of keys) {
    const actual = lowerMap[key.toLowerCase()];
    if (actual) {
      const val = obj[actual];
      if (typeof val === 'string') return val;
      if (typeof val === 'number') return String(val);
    }
  }
  return undefined;
}

/** 从对象中安全读取数值，兼容两种字段名（大写/驼峰/不区分大小写） */
export function resolveNumber(
  obj: Record<string, unknown>,
  ...keys: string[]
): number | undefined {
  // 先精确匹配
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const parsed = parseFloat(val);
      if (!isNaN(parsed)) return parsed;
    }
  }
  // 再不区分大小写匹配
  const lowerMap = Object.fromEntries(
    Object.keys(obj).map((k) => [k.toLowerCase(), k])
  );
  for (const key of keys) {
    const actual = lowerMap[key.toLowerCase()];
    if (actual) {
      const val = obj[actual];
      if (typeof val === 'number') return val;
      if (typeof val === 'string') {
        const parsed = parseFloat(val);
        if (!isNaN(parsed)) return parsed;
      }
    }
  }
  return undefined;
}
export function parseBillQueryResult<T extends Record<string, unknown>>(
  rows: unknown[],
  fieldKeys: string[]
): T[] {
  return rows.map((row) => {
    const values = Array.isArray(row) ? row : [row];
    const obj: Record<string, unknown> = {};
    fieldKeys.forEach((key, idx) => {
      const cleanKey = key.replace(/^FMaterialId\./, '').replace(/^F\w+\./, '');
      obj[cleanKey] = values[idx];
    });
    return obj as T;
  });
}
