/**
 * 检验仪器编码 ↔ 名称映射表
 * 数据来源：用户提供的金蝶检验仪器对照表截图 (6.4.png)
 * 当 View 接口返回的 FInspectInstrumentId.Name 为空时，用此表回退显示
 *
 * 支持动态同步：用户可通过"数据同步"页面从金蝶 BillQuery 拉取最新数据，
 * 拉取结果保存在 AsyncStorage 中，优先于硬编码表使用。
 */

import { loadInspectInstrumentMapFromStorage } from '@/api/kingdee/inspect';

export const INSPECT_INSTRUMENT_NAME_MAP: Record<string, string> = {
  'JYYQ000001': '卷尺',
  'JYYQ000002': '卡尺',
  'JYYQ000003': '电子秤',
  'JYYQ000004': '甲醛测试箱',
  'JYYQ000005': 'TVOC测试仪',
  'JYYQ000006': '色差仪',
  'JYYQ000007': '硬度计',
  'JYYQ000008': '塞尺',
  'JYYQ000009': '寿命/耐疲劳测试',
  'JYYQ000010': '高低温测试箱',
  'JYYQ000011': '木材水分测试仪（针插式）',
  'JYYQ000012': '氧指数测定仪',
  'JYYQ000013': '防火门甲醛测定仪',
  'JYYQ000014': '电热鼓风干燥机',
  'JYYQ000015': '指针式拉压力计',
  'JYYQ000016': '外径千分尺',
  'JYYQ000017': '温湿度计',
  'JYYQ000018': '光泽度计',
  'JYYQ000019': '抗压抗折试验机',
  'JYYQ000020': '防火门可靠性测试装置',
  'JYYQ000021': '角度尺',
  'JYYQ000022': '邵氏硬度计',
};

/** 内存缓存：从 AsyncStorage 加载的同步数据 */
let _cachedInstrumentMap: Record<string, string> | null = null;

/** 从 AsyncStorage 预加载检验仪器映射表到内存缓存 */
export async function loadInstrumentMapFromStorage(): Promise<void> {
  _cachedInstrumentMap = await loadInspectInstrumentMapFromStorage();
}

/** 获取当前内存中的映射表（仅供调试用） */
export function getCachedInstrumentMap(): Record<string, string> | null {
  return _cachedInstrumentMap;
}

/** 根据编码查找检验仪器名称（优先使用同步数据，其次硬编码兜底） */
export function getInspectInstrumentName(code: string | undefined): string | undefined {
  if (!code) return undefined;
  // 1. 优先使用从金蝶同步的最新数据
  if (_cachedInstrumentMap && code in _cachedInstrumentMap) {
    return _cachedInstrumentMap[code];
  }
  // 2. 回退到硬编码默认表
  return INSPECT_INSTRUMENT_NAME_MAP[code];
}
