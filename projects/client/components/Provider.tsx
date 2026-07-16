import { AuthProvider } from '@/contexts/AuthContext';
import { type ReactNode, useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { WebOnlyColorSchemeUpdater } from './ColorSchemeUpdater';
import { WebOnlyPrettyScrollbar } from './PrettyScrollbar';
import { initApiConfig } from '@/api/config';
import { initApiToken } from '@/api/client';
import { initKingdeeBaseUrl } from '@/api/kingdee/client';

function Provider({ children }: { children: ReactNode }) {
  useEffect(() => {
    // 应用启动时恢复 API 配置和鉴权 Token
    initApiConfig().catch(console.error);
    initApiToken().catch(console.error);
    initKingdeeBaseUrl().catch(console.error);
  }, []);

  return (
    <WebOnlyColorSchemeUpdater>
      <WebOnlyPrettyScrollbar>
        <AuthProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            {children}
          </GestureHandlerRootView>
        </AuthProvider>
      </WebOnlyPrettyScrollbar>
    </WebOnlyColorSchemeUpdater>
  );
}

export { Provider };
