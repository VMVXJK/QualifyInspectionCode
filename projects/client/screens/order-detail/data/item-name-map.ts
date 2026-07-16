/**
 * 检验项目编码 ↔ 名称映射表
 * 数据来源：用户提供的金蝶检验项目对照表截图
 * 当 View 接口返回的 FInspectItemId.Name 为空时，用此表回退显示
 *
 * 支持动态同步：用户可通过"数据同步"页面从金蝶 BillQuery 拉取最新数据，
 * 拉取结果保存在 AsyncStorage 中，优先于硬编码表使用。
 */

import { loadInspectItemMapFromStorage } from '@/api/kingdee/inspect';

export const INSPECT_ITEM_NAME_MAP: Record<string, string> = {
  'JYXM001195': '其他要求',
  'JYXM001194': '性能要求',
  'JYXM001193': '规格重量',
  'JYXM001192': '硬度检验',
  'JYXM001191': '尺寸规格',
  'JYXM001190': '外观检验',
  'JYXM001189': '包装检验',
  'JYXM001188': '碳塑槽孔吸声板22/3, 23/2, 24/1',
  'JYXM001187': '尺寸公差',
  'JYXM001186': '外观检验',
  'JYXM001185': '标识检验',
  'JYXM001184': '包装检验',
  'JYXM001183': '测试检验',
  'JYXM001182': '外观检验',
  'JYXM001181': '标识',
  'JYXM001180': '包装',
  'JYXM001179': '光泽度',
  'JYXM001178': '外观',
  'JYXM001177': '包装检验',
  'JYXM001176': '饰面复合尺寸',
  'JYXM001175': '饰面复合外观',
  'JYXM001174': '框体组装尺寸',
  'JYXM001173': '框体组装外观',
  'JYXM001172': '铝材尺寸',
  'JYXM001171': '铝材外观',
  'JYXM001170': '玻璃纤维棉尺寸',
  'JYXM001169': '玻璃纤维棉表面',
  'JYXM001168': '布料尺寸',
  'JYXM001167': '布料外观',
  'JYXM001166': '材质',
  'JYXM001165': '空气质量',
  'JYXM001164': '包装外箱',
  'JYXM001163': '包装方式',
  'JYXM001162': '配件包',
  'JYXM001161': '风扇',
  'JYXM001160': '接线',
  'JYXM001159': '灯具要求',
  'JYXM001158': '插座功能',
  'JYXM001157': '人体感应功能',
  'JYXM001156': '开关/调速功能',
  'JYXM001155': '聚酯纤维板结构',
  'JYXM001154': '弧形盖与弧形铝结构',
};

/** 内存缓存：从 AsyncStorage 加载的同步数据 */
let _cachedItemMap: Record<string, string> | null = null;

/** 从 AsyncStorage 预加载检验项目映射表到内存缓存 */
export async function loadItemMapFromStorage(): Promise<void> {
  _cachedItemMap = await loadInspectItemMapFromStorage();
}

/** 获取当前内存中的映射表（仅供调试用） */
export function getCachedItemMap(): Record<string, string> | null {
  return _cachedItemMap;
}

/** 根据编码查找检验项目名称（优先使用同步数据，其次硬编码兜底） */
export function getInspectItemName(code: string | undefined): string | undefined {
  if (!code) return undefined;
  // 1. 优先使用从金蝶同步的最新数据
  if (_cachedItemMap && code in _cachedItemMap) {
    return _cachedItemMap[code];
  }
  // 2. 回退到硬编码默认表
  return INSPECT_ITEM_NAME_MAP[code];
}
