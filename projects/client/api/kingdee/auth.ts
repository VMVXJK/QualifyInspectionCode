/**
 * 金蝶云星空登录鉴权封装
 *
 * 对接接口（详见 WebAPI 文档 5.1.1）：
 * https://121.37.216.69/K3Cloud/Kingdee.BOS.WebApi.ServicesStub.AuthService.LoginBySign.common.kdsvc
 *
 * 同时支持：
 * - Logout（登出，5.1.18）
 */

import {
  KINGDEE_BASE_URL,
  fetchWithTimeout,
  setKingdeeSessionCookie,
  clearKingdeeSession,
  isAbortError,
  isNetworkError,
  getNetworkErrorMessage,
  callKingdeeSingle,
} from './client';
import * as Crypto from 'expo-crypto';
import type { KingdeeLoginResult } from './types';

/** 金蝶云星空登录地址 */
const LOGIN_URL = `${KINGDEE_BASE_URL}/K3Cloud/Kingdee.BOS.WebApi.ServicesStub.AuthService.LoginBySign.common.kdsvc`;

/** 金蝶云星空账号密码验证地址 */
const VALIDATE_USER_URL = `${KINGDEE_BASE_URL}/K3Cloud/Kingdee.BOS.WebApi.ServicesStub.AuthService.ValidateUser.common.kdsvc`;

/** 固定登录配置 */
const ACCT_ID = '6a015236279e5b';
const DEFAULT_USER_NAME = 'soundboxpod';
const APP_ID = '331723_QcbJ49tF0phbwV+OS67sTc1q7sWXWLoP';
const APP_SECRET = '64f63ed472534bf5b2538969f25e4777';
const LCID = 2052;

/**
 * 生成 SHA256 签名
 *
 * 金蝶规则（对应文档 C# 示例）：
 * 将账套ID、用户名、应用ID、应用秘钥、时间戳放到数组，
 * 按 Array.Sort(arr, StringComparer.Ordinal) 排序（Unicode 码点逐字符比较），
 * 排序后用 string.Join("", arr) 拼接，UTF-8 编码后 SHA256 哈希，
 * 结果转小写。
 */
async function generateSign(timestamp: number, username?: string): Promise<string> {
  const userName = username || DEFAULT_USER_NAME;
  const arr = [ACCT_ID, userName, APP_ID, APP_SECRET, String(timestamp)];
  // 等效于 C# Array.Sort(arr, StringComparer.Ordinal)：按 UTF-16/Unicode 码点字典序
  arr.sort((a, b) => {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  });
  const raw = arr.join('');

  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    raw
  );
  return digest.toLowerCase();
}

/**
 * 使用签名方式自动登录金蝶云星空（LoginBySign）
 *
 * 每次调用动态生成时间戳（Unix 秒级）和 SHA256 签名，
 * 请求格式：{ "parameters": [账套ID, 用户名, appId, 时间戳, 签名, lcid] }
 *
 * 返回 LoginResultType：
 *   1   登录成功
 *   -5  需要表单处理（管理员登录可能出现，API验证时可认为允许）
 *   0   用户名或密码错误
 *   -1  登录失败
 */
export async function loginBySign(username?: string): Promise<KingdeeLoginResult> {
  clearKingdeeSession();

  const timestamp = Math.floor(Date.now() / 1000);
  const sign = await generateSign(timestamp, username);

  const userName = username || DEFAULT_USER_NAME;
  const params = [ACCT_ID, userName, APP_ID, String(timestamp), sign, LCID];

  let res: Response;
  try {
    res = await fetchWithTimeout(LOGIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json;charset=UTF-8' },
      body: JSON.stringify({ parameters: params }),
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error('请求超时，请检查网络或金蝶服务器状态');
    }
    if (isNetworkError(error)) {
      throw new Error(getNetworkErrorMessage(error));
    }
    const original = error instanceof Error ? error.message : String(error);
    throw new Error(`请求失败：${original}`);
  }

  // 保存服务端返回的 Set-Cookie（会话保持）
  const setCookie = res.headers.get('Set-Cookie');
  if (setCookie) {
    const match = setCookie.match(/([^;]+)/);
    if (match) {
      setKingdeeSessionCookie(match[1]);
    }
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body && typeof (body as Record<string, unknown>).message === 'string'
        ? String((body as Record<string, unknown>).message)
        : `HTTP ${res.status}: ${res.statusText}`;
    throw new Error(message);
  }

  // 金蝶有时返回 JSON 字符串，有时返回对象，做兼容处理
  const parsed: KingdeeLoginResult =
    typeof body === 'string' ? JSON.parse(body) : (body as KingdeeLoginResult);

  if (parsed.LoginResultType !== 1 && parsed.LoginResultType !== -5) {
    throw new Error(parsed.Message || `登录失败，结果码：${parsed.LoginResultType}`);
  }

  // 保存会话ID（如果返回中有）
  if (parsed.KDSVCSessionId) {
    setKingdeeSessionCookie(`KDSVCSessionId=${parsed.KDSVCSessionId}`);
  }

  return parsed;
}

/**
 * 使用账号密码验证用户身份（ValidateUser）
 *
 * 用于质检员输入自己的金蝶账号密码进行身份验证，
 * 验证通过后再使用其用户名进行 LoginBySign 签名登录。
 */
export async function validateUser(username: string, password: string): Promise<KingdeeLoginResult> {
  clearKingdeeSession();

  const params = [ACCT_ID, username, password, LCID];

  let res: Response;
  try {
    res = await fetchWithTimeout(VALIDATE_USER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json;charset=UTF-8' },
      body: JSON.stringify({ parameters: params }),
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error('请求超时，请检查网络或金蝶服务器状态');
    }
    if (isNetworkError(error)) {
      throw new Error(getNetworkErrorMessage(error));
    }
    const original = error instanceof Error ? error.message : String(error);
    throw new Error(`请求失败：${original}`);
  }

  // 保存服务端返回的 Set-Cookie（会话保持）
  const setCookie = res.headers.get('Set-Cookie');
  if (setCookie) {
    const match = setCookie.match(/([^;]+)/);
    if (match) {
      setKingdeeSessionCookie(match[1]);
    }
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body && typeof (body as Record<string, unknown>).message === 'string'
        ? String((body as Record<string, unknown>).message)
        : `HTTP ${res.status}: ${res.statusText}`;
    throw new Error(message);
  }

  const parsed: KingdeeLoginResult =
    typeof body === 'string' ? JSON.parse(body) : (body as KingdeeLoginResult);

  if (parsed.LoginResultType !== 1 && parsed.LoginResultType !== -5) {
    throw new Error(parsed.Message || `账号或密码错误（结果码：${parsed.LoginResultType}）`);
  }

  // 保存会话ID（如果返回中有）
  if (parsed.KDSVCSessionId) {
    setKingdeeSessionCookie(`KDSVCSessionId=${parsed.KDSVCSessionId}`);
  }

  return parsed;
}

/**
 * 登出（Logout）
 *
 * 对接接口（详见 WebAPI 文档 5.1.18）：
 * https://121.37.216.69/K3Cloud/Kingdee.BOS.WebApi.ServicesStub.AuthService.Logout.common.kdsvc
 */
export async function logoutKingdee(): Promise<boolean> {
  try {
    await callKingdeeSingle<boolean>('Logout', {});
  } catch {
    // 忽略
  } finally {
    clearKingdeeSession();
  }
  return true;
}
