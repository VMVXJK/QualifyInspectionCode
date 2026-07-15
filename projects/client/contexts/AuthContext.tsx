import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loginBySign, logoutKingdee, validateUser } from '@/api/kingdee/auth';
import { clearKingdeeSession } from '@/api/kingdee/client';
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
const LOGIN_HISTORY_KEY = 'auth_login_history';

/** 记录登录历史（只保存用户名和时间，不保存密码） */
async function recordLoginHistory(username: string) {
  try {
    const historyJson = await AsyncStorage.getItem(LOGIN_HISTORY_KEY);
    const history: { username: string; time: string }[] = historyJson ? JSON.parse(historyJson) : [];
    // 插入到最前面
    history.unshift({ username, time: new Date().toISOString() });
    // 最多保留 50 条
    if (history.length > 50) history.pop();
    await AsyncStorage.setItem(LOGIN_HISTORY_KEY, JSON.stringify(history));
  } catch {
    // 忽略记录错误
  }
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserOut | null>(null);
  const [loginResult, setLoginResult] = useState<KingdeeLoginResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 启动时：先清理旧会话，再尝试恢复记住的用户状态
  useEffect(() => {
    const init = async () => {
      try {
        // 尝试通知服务端登出（网络失败则忽略）
        await logoutKingdee();
      } catch {
        // 忽略
      } finally {
        // 无论服务端是否响应，强制清理本地会话
        clearKingdeeSession();
        setLoginResult(null);

        // 尝试恢复已登录用户信息（仅恢复 UI 状态，不自动登录）
        try {
          const userJson = await AsyncStorage.getItem(USER_KEY);
          if (userJson) {
            setUser(JSON.parse(userJson));
          }
          const resultJson = await AsyncStorage.getItem(LOGIN_RESULT_KEY);
          if (resultJson) {
            setLoginResult(JSON.parse(resultJson));
          }
        } catch {
          // 忽略恢复错误
        }

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
