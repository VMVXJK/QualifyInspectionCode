/**
 * 质检方案编码 ↔ 名称映射表
 * 数据来源：金蝶云星空 QM_QCScheme 基础资料
 *
 * 支持动态同步：用户可通过"数据同步"页面从金蝶 BillQuery 拉取最新数据，
 * 拉取结果保存在 AsyncStorage 中，优先于硬编码表使用。
 */

import { loadQCSchemeMapFromStorage } from '@/api/kingdee/inspect';

export const QC_SCHEME_NAME_MAP: Record<string, string> = {};

/** 内存缓存：从 AsyncStorage 加载的同步数据 */
let _cachedQCSchemeMap: Record<string, string> | null = null;

/** 从 AsyncStorage 预加载质检方案映射表到内存缓存 */
export async function loadQCSchemeMapFromStorageLocal(): Promise<void> {
  _cachedQCSchemeMap = await loadQCSchemeMapFromStorage();
}

/** 获取当前内存中的映射表（仅供调试用） */
export function getCachedQCSchemeMap(): Record<string, string> | null {
  return _cachedQCSchemeMap;
}

/** 根据编码查找质检方案名称（优先使用同步数据，其次硬编码兜底） */
export function getQCSchemeName(code: string | undefined): string | undefined {
  if (!code) return undefined;
  // 1. 优先使用从金蝶同步的最新数据
  if (_cachedQCSchemeMap && code in _cachedQCSchemeMap) {
    return _cachedQCSchemeMap[code];
  }
  // 2. 回退到硬编码默认表
  return QC_SCHEME_NAME_MAP[code];
}
