/**
 * 金蝶云星空工具函数
 */

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

/**
 * 解析基础资料对象上某个属性的字符串值，兼容三种格式：
 * - 直接字符串："xxx"
 * - 多语言对象：{ zh_CN: 'xxx', en_US: 'xxx' }
 * - 多语言数组（View 接口实测格式）：[{ Key: 2052, Value: "中文" }, { Key: 1033, Value: "English" }]
 *   2052 = 简体中文 LCID，优先取该项；取不到则回退第一项
 */
function resolveMultiLangField(obj: Record<string, unknown>, candidateKeys: string[]): string | undefined {
  for (const key of candidateKeys) {
    const val = obj[key];
    if (typeof val === 'string') return val;
  }

  for (const key of candidateKeys) {
    const val = obj[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const valObj = val as Record<string, unknown>;
      const direct =
        (typeof valObj.zh_CN === 'string' ? valObj.zh_CN : undefined) ||
        (typeof valObj.en_US === 'string' ? valObj.en_US : undefined) ||
        (typeof valObj['zh-CN'] === 'string' ? valObj['zh-CN'] : undefined) ||
        (typeof valObj['en-US'] === 'string' ? valObj['en-US'] : undefined);
      if (direct) return direct;
    }
  }

  for (const key of candidateKeys) {
    const val = obj[key];
    if (Array.isArray(val)) {
      const arr = val as Array<Record<string, unknown>>;
      const zhEntry = arr.find((it) => it && (it.Key === 2052 || it.Key === '2052'));
      const entry = zhEntry ?? arr[0];
      if (entry && typeof entry.Value === 'string') return entry.Value;
    }
  }

  return undefined;
}

/** 解析金蝶基础资料对象，兼容两种格式：
 * - View API 格式：{ Id, Number, Name }
 * - BillQuery/Legacy 格式：{ FNumber, FName }
 * - 多语言 Name/Specification：{ zh_CN: 'xxx', en_US: 'xxx' } 或 [{ Key, Value }]
 */
export function resolveBaseData(val: unknown): { number?: string; name?: string; specification?: string } {
  if (!val || typeof val !== 'object') return {};
  const obj = val as Record<string, unknown>;

  // 号码：兼容 FNumber / FNUMBER / Number / number
  const number =
    (typeof obj.FNumber === 'string' ? obj.FNumber : undefined) ||
    (typeof obj.FNUMBER === 'string' ? obj.FNUMBER : undefined) ||
    (typeof obj.Number === 'string' ? obj.Number : undefined) ||
    (typeof obj.number === 'string' ? obj.number : undefined);

  // 名称：兼容 FName / FNAME / Name / name（含多语言对象/数组）
  const name = resolveMultiLangField(obj, ['FName', 'FNAME', 'Name', 'name']);

  // 规格型号：兼容 FSpecification / FSPECIFICATION / Specification / specification（含多语言对象/数组）
  const specification = resolveMultiLangField(obj, ['FSpecification', 'FSPECIFICATION', 'Specification', 'specification']);

  return { number, name, specification };
}
