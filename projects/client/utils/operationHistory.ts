import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * 统一的操作历史记录模块
 * 覆盖：登录记录、检验单保存记录、检验单提交记录
 * 每种类型各自独立存储在 AsyncStorage 中，最多保留 50 条（最新在前）
 */

export type HistoryKind = 'login' | 'save' | 'submit';

export interface OperationHistoryItem {
  kind: HistoryKind;
  /** ISO 时间戳 */
  time: string;
  /** 单据编号（save/submit 使用） */
  orderNo?: string;
  /** 登录用户名（login 使用） */
  username?: string;
  /** 操作是否成功（save/submit 使用） */
  success?: boolean;
  /** 失败原因或补充说明 */
  detail?: string;
}

const HISTORY_KEYS: Record<HistoryKind, string> = {
  login: 'history_login',
  save: 'history_save',
  submit: 'history_submit',
};

/** 旧版登录记录的 AsyncStorage key（兼容读取） */
const LEGACY_LOGIN_HISTORY_KEY = 'auth_login_history';

const MAX_HISTORY_COUNT = 50;

/** 记录一条操作历史（写入失败静默忽略，不影响主流程） */
export async function recordHistory(
  kind: HistoryKind,
  item: Omit<OperationHistoryItem, 'kind'>
): Promise<void> {
  try {
    const key = HISTORY_KEYS[kind];
    const existingJson = await AsyncStorage.getItem(key);
    const existing: OperationHistoryItem[] = existingJson ? JSON.parse(existingJson) : [];
    existing.unshift({ kind, ...item });
    if (existing.length > MAX_HISTORY_COUNT) existing.pop();
    await AsyncStorage.setItem(key, JSON.stringify(existing));
  } catch {
    // 忽略记录错误
  }
}

/**
 * 读取指定类型的历史记录
 * login 类型兼容读取旧版 `auth_login_history` key（数据结构为 { username, time }[]，无 kind 字段）
 */
export async function loadHistory(kind: HistoryKind): Promise<OperationHistoryItem[]> {
  try {
    const key = HISTORY_KEYS[kind];
    const json = await AsyncStorage.getItem(key);
    if (json) {
      return JSON.parse(json);
    }

    if (kind === 'login') {
      const legacyJson = await AsyncStorage.getItem(LEGACY_LOGIN_HISTORY_KEY);
      if (legacyJson) {
        const legacy: { username: string; time: string }[] = JSON.parse(legacyJson);
        return legacy.map((it) => ({ kind: 'login' as const, username: it.username, time: it.time }));
      }
    }

    return [];
  } catch {
    return [];
  }
}
