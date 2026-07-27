import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { setSessionExpiredHandler } from '@/api/kingdee/client';
import { showError } from '@/utils/toast';

/**
 * 全局会话守卫：在根布局中调用一次。
 * 检测到 SESSION_LOST 时自动退出登录并跳转到登录页。
 */
export function useSessionGuard() {
  const { logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    setSessionExpiredHandler(async () => {
      showError('会话已过期，请重新登录');
      try {
        await logout();
      } catch {
        // 忽略登出接口错误，强制清理本地状态
      }
      router.replace('/login');
    });

    return () => {
      setSessionExpiredHandler(null);
    };
  }, [logout, router]);
}
