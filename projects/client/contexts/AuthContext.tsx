import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loginBySign, logoutKingdee, validateUser } from '@/api/kingdee/auth';
import { clearKingdeeSession } from '@/api/kingdee/client';
import {
  syncQCSchemes,
  syncInspectItems,
  syncInspectMethods,
  syncInspectInstruments,
  syncInspectValueOptions,
  syncBillTypes,
} from '@/api/kingdee/inspect';
import { recordHistory } from '@/utils/operationHistory';
import type { KingdeeLoginResult } from '@/api/kingdee/types';

interface UserOut {
  id?: string;
  name?: string;
  avatar?: string;
  acctId?: string;
  [key: string]: unknown;
}

interface LoginCredentials {
  username: string;
  password: string;
  remember?: boolean;
}

interface AuthContextType {
  user: UserOut | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** 金蝶登录结果（包含会话信息） */
  loginResult: KingdeeLoginResult | null;
  /** 使用账号密码验证后，再用该用户名进行签名登录 */
  login: (credentials?: LoginCredentials) => Promise<void>;
  /** 登出并清除会话 */
  logout: () => Promise<void>;
  updateUser: (userData: Partial<UserOut>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const USER_KEY = 'auth_user';
const LOGIN_RESULT_KEY = 'auth_kingdee_result';
const REMEMBERED_USERNAME_KEY = 'auth_remembered_username';
const REMEMBERED_PASSWORD_KEY = 'auth_remembered_password';

/** 记录登录历史（只保存用户名和时间，不保存密码） */
async function recordLoginHistory(username: string) {
  await recordHistory('login', { username, time: new Date().toISOString() });
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserOut | null>(null);
  const [loginResult, setLoginResult] = useState<KingdeeLoginResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 启动时：清理旧会话，不恢复登录状态，强制用户重新登录
  // （sessionCookie 是内存变量，重启后必然丢失，若仍从 AsyncStorage 恢复
  //  user/loginResult 会导致界面显示"已登录"但请求全部因 SESSION_LOST 失败）
  useEffect(() => {
    const init = async () => {
      try {
        // 尝试通知服务端登出（网络失败则忽略）
        await logoutKingdee();
      } catch {
        // 忽略
      } finally {
        // 强制清理本地会话与已登录状态，用户需重新登录
        clearKingdeeSession();
        setLoginResult(null);
        setUser(null);
        await AsyncStorage.multiRemove([USER_KEY, LOGIN_RESULT_KEY]);

        setIsLoading(false);
      }
    };
    init();
  }, []);

  /**
   * 登录流程：
   * 1. 如果提供了 credentials，先调用 validateUser 验证账号密码
   * 2. 验证成功后调用 logoutKingdee 清除该会话
   * 3. 用输入的用户名调用 loginBySign 进行签名登录
   * 4. 保存用户信息和登录结果
   * 5. 如果 remember 为 true，保存账号密码到 AsyncStorage
   */
  const login = useCallback(async (credentials?: LoginCredentials) => {
    if (credentials) {
      // 两步登录：先验证账号密码
      const validateResult = await validateUser(credentials.username, credentials.password);
      if (validateResult.LoginResultType !== 1 && validateResult.LoginResultType !== -5) {
        throw new Error(validateResult.Message || '账号或密码错误');
      }

      // 验证成功后，退出当前会话（ValidateUser 建立的）
      await logoutKingdee();

      // 再用该用户名进行签名登录
      const result = await loginBySign(credentials.username);

      const mergedUser: UserOut = {
        name: credentials.username,
        acctId: '6a015236279e5b',
      };

      setLoginResult(result);
      setUser(mergedUser);

      await AsyncStorage.setItem(LOGIN_RESULT_KEY, JSON.stringify(result));
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(mergedUser));

      if (credentials.remember) {
        await AsyncStorage.setItem(REMEMBERED_USERNAME_KEY, credentials.username);
        await AsyncStorage.setItem(REMEMBERED_PASSWORD_KEY, credentials.password);
      } else {
        await AsyncStorage.multiRemove([REMEMBERED_USERNAME_KEY, REMEMBERED_PASSWORD_KEY]);
      }

      // 记录登录历史（只记用户名，不记密码）
      await recordLoginHistory(credentials.username);

      // 登录成功后后台静默同步基础数据（不阻塞登录跳转）
      Promise.allSettled([
        syncQCSchemes(),
        syncInspectItems(),
        syncInspectMethods(),
        syncInspectInstruments(),
        syncInspectValueOptions(),
        syncBillTypes(),
      ]).catch(() => { /* 静默忽略同步失败 */ });
    } else {
      // 向后兼容：无参数时使用默认账号签名登录
      const result = await loginBySign();

      const mergedUser: UserOut = {
        name: 'soundboxpod',
        acctId: '6a015236279e5b',
      };

      setLoginResult(result);
      setUser(mergedUser);

      await AsyncStorage.setItem(LOGIN_RESULT_KEY, JSON.stringify(result));
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(mergedUser));
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutKingdee();
    } catch {
      // 即使接口失败也强制本地登出
    } finally {
      clearKingdeeSession();
      setUser(null);
      setLoginResult(null);
      await AsyncStorage.multiRemove([USER_KEY, LOGIN_RESULT_KEY]);
    }
  }, []);

  const updateUser = useCallback((userData: Partial<UserOut>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...userData };
      AsyncStorage.setItem(USER_KEY, JSON.stringify(updated)).catch(console.error);
      return updated;
    });
  }, []);

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    loginResult,
    login,
    logout,
    updateUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

/** 获取记住的账号密码（供登录页自动填充） */
export async function getRememberedCredentials(): Promise<{ username: string; password: string } | null> {
  try {
    const username = await AsyncStorage.getItem(REMEMBERED_USERNAME_KEY);
    const password = await AsyncStorage.getItem(REMEMBERED_PASSWORD_KEY);
    if (username && password) {
      return { username, password };
    }
  } catch {
    // 忽略
  }
  return null;
}
