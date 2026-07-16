/**
 * 检验方法编码 ↔ 名称映射表
 * 数据来源：用户提供的金蝶检验方法对照表截图 (6.3.png)
 * 当 View 接口返回的 FInspectMethodId.Name 为空时，用此表回退显示
 *
 * 支持动态同步：用户可通过"数据同步"页面从金蝶 BillQuery 拉取最新数据，
 * 拉取结果保存在 AsyncStorage 中，优先于硬编码表使用。
 */

import { loadInspectMethodMapFromStorage } from '@/api/kingdee/inspect';

export const INSPECT_METHOD_NAME_MAP: Record<string, string> = {
  'JYFF000001': '感官检验',
  'JYFF000002': '几何测量',
  'JYFF000003': '理化性能检验',
  'JYFF000004': '可靠性试验',
  'JYFF000005': '破坏性检验',
  'JYFF000006': '环保性检测',
};

/** 内存缓存：从 AsyncStorage 加载的同步数据 */
let _cachedMethodMap: Record<string, string> | null = null;

/** 从 AsyncStorage 预加载检验方法映射表到内存缓存 */
export async function loadMethodMapFromStorage(): Promise<void> {
  _cachedMethodMap = await loadInspectMethodMapFromStorage();
}

/** 获取当前内存中的映射表（仅供调试用） */
export function getCachedMethodMap(): Record<string, string> | null {
  return _cachedMethodMap;
}

/** 根据编码查找检验方法名称（优先使用同步数据，其次硬编码兜底） */
export function getInspectMethodName(code: string | undefined): string | undefined {
  if (!code) return undefined;
  // 1. 优先使用从金蝶同步的最新数据
  if (_cachedMethodMap && code in _cachedMethodMap) {
    return _cachedMethodMap[code];
  }
  // 2. 回退到硬编码默认表
  return INSPECT_METHOD_NAME_MAP[code];
}
