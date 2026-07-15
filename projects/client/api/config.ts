/**
 * API 运行时配置管理
 *
 * 【说明】
 * 本项目已完全对接金蝶云星空 WebAPI，不再使用标准 REST 后端。
 * 金蝶服务器地址由登录时动态传入（见 api/kingdee/auth.ts 的 loginBySign），
 * 本文件不再承担金蝶地址配置职责，仅保留废弃兼容。
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const CONFIG_KEY = 'api_base_url';

let runtimeBaseUrl: string | null = null;

/** 获取当前生效的标准 API Base URL（已废弃，保留兼容） */
export function getApiBaseUrl(): string {
  if (runtimeBaseUrl) {
    return runtimeBaseUrl.replace(/\/$/, '');
  }
  const env = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;
  if (env) {
    return env.replace(/\/$/, '');
  }
  return '';
}

/** 检查是否已配置生产环境地址（非 localhost） */
export function isApiConfigured(): boolean {
  const url = getApiBaseUrl();
  return !url.includes('localhost') && !url.includes('127.0.0.1');
}

// ────────────────────────────────────────────────────────────
// 以下方法仅限内部/开发使用，不开放给终端用户修改
// ────────────────────────────────────────────────────────────

/** 【内部】设置运行时 API Base URL（持久化到 AsyncStorage） */
export async function _setApiBaseUrl(url: string): Promise<void> {
  const trimmed = url.trim().replace(/\/$/, '');
  runtimeBaseUrl = trimmed;
  await AsyncStorage.setItem(CONFIG_KEY, trimmed);
}

/** 【内部】从 AsyncStorage 恢复配置（应用启动时调用） */
export async function initApiConfig(): Promise<void> {
  try {
    const saved = await AsyncStorage.getItem(CONFIG_KEY);
    if (saved) runtimeBaseUrl = saved;
  } catch (error) {
    console.error('Failed to restore API config:', error);
  }
}

/** 【内部】清除运行时配置 */
export async function _resetApiConfig(): Promise<void> {
  runtimeBaseUrl = null;
  await AsyncStorage.removeItem(CONFIG_KEY);
}
