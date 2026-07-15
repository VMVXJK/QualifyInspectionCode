/**
 * API 基础客户端 — 预留金蝶接口切换点
 *
 * 能力：
 * - 请求超时（默认 15s）
 * - 统一错误处理（提取后端 message）
 * - 网络异常识别
 * - 预留 Authorization 注入点
 * - 支持运行时动态切换后端地址（通过 api/config.ts）
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiBaseUrl } from './config';

const REQUEST_TIMEOUT = 15000;

/** 向后兼容：动态获取当前生效的 API Base URL */
export const API_BASE = getApiBaseUrl();

let globalToken: string | null = null;

/** 设置全局鉴权 Token（供 AuthContext 调用） */
export function setApiToken(token: string | null) {
  globalToken = token;
}

/** 从 AsyncStorage 读取 token 并设置（应用启动时调用） */
export async function initApiToken() {
  const token = await AsyncStorage.getItem('auth_token');
  globalToken = token;
}

async function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
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

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as Record<string, unknown>).name === 'AbortError'
  );
}

function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) {
    const msg = error.message.toLowerCase();
    return msg.includes('network') || msg.includes('fetch') || msg.includes('failed');
  }
  if (isAbortError(error)) {
    return true;
  }
  return false;
}

async function handleResponse(res: Response): Promise<unknown> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const message =
      (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string')
        ? body.message
        : `HTTP ${res.status}: ${res.statusText}`;
    throw new Error(message);
  }

  return body;
}

function buildHeaders(extra?: HeadersInit): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (globalToken) {
    headers['Authorization'] = `Bearer ${globalToken}`;
  }
  if (extra) {
    const extraObj = extra instanceof Headers ? Object.fromEntries(extra.entries()) : (extra as Record<string, string>);
    Object.assign(headers, extraObj);
  }
  return headers;
}

export async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const fullUrl = `${getApiBaseUrl()}${url}`;
  try {
    const res = await fetchWithTimeout(fullUrl, {
      ...options,
      headers: buildHeaders(options?.headers),
    });
    const body = await handleResponse(res);
    return body as T;
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error('请求超时，请检查网络连接');
    }
    if (isNetworkError(error)) {
      throw new Error('网络异常，请检查网络连接');
    }
    throw error;
  }
}

export async function putJson<T>(url: string, body: unknown): Promise<T> {
  return fetchJson<T>(url, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  return fetchJson<T>(url, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function del(url: string): Promise<void> {
  const fullUrl = `${getApiBaseUrl()}${url}`;
  try {
    const res = await fetchWithTimeout(fullUrl, {
      method: 'DELETE',
      headers: buildHeaders(),
    });
    await handleResponse(res);
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error('请求超时，请检查网络连接');
    }
    if (isNetworkError(error)) {
      throw new Error('网络异常，请检查网络连接');
    }
    throw error;
  }
}
