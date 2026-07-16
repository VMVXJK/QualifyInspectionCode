/**
 * 单据类型编码 ↔ 名称映射表
 * 数据来源：金蝶云星空 BOS_BillType 基础资料
 *
 * 支持动态同步：用户可通过"数据同步"页面从金蝶 BillQuery 拉取最新数据，
 * 拉取结果保存在 AsyncStorage 中，优先于硬编码表使用。
 */

import { loadBillTypeMapFromStorage } from '@/api/kingdee/inspect';

export const BILL_TYPE_NAME_MAP: Record<string, string> = {
  'JYD001_SYS': '来料检验',
  'JYD002_SYS': '过程检验',
  'JYD003_SYS': '出货检验',
};

/** 内存缓存：从 AsyncStorage 加载的同步数据 */
let _cachedBillTypeMap: Record<string, string> | null = null;

/** 从 AsyncStorage 预加载单据类型映射表到内存缓存 */
export async function loadBillTypeMapFromStorageLocal(): Promise<void> {
  _cachedBillTypeMap = await loadBillTypeMapFromStorage();
}

/** 获取当前内存中的映射表（仅供调试用） */
export function getCachedBillTypeMap(): Record<string, string> | null {
  return _cachedBillTypeMap;
}

/** 根据编码查找单据类型名称（优先使用同步数据，其次硬编码兜底） */
export function getBillTypeName(code: string | undefined): string | undefined {
  if (!code) return undefined;
  // 1. 优先使用从金蝶同步的最新数据
  if (_cachedBillTypeMap && code in _cachedBillTypeMap) {
    return _cachedBillTypeMap[code];
  }
  // 2. 回退到硬编码默认表
  return BILL_TYPE_NAME_MAP[code];
}
