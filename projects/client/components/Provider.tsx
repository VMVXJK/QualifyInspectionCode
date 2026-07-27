import { AuthProvider } from '@/contexts/AuthContext';
import { type ReactNode, useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { WebOnlyColorSchemeUpdater } from './ColorSchemeUpdater';
import { WebOnlyPrettyScrollbar } from './PrettyScrollbar';
import { initKingdeeBaseUrl } from '@/api/kingdee/client';
import { useSessionGuard } from '@/hooks/useSessionGuard';

function SessionGuard() {
  useSessionGuard();
  return null;
}

function Provider({ children }: { children: ReactNode }) {
  useEffect(() => {
    initKingdeeBaseUrl().catch(console.error);
  }, []);

  return (
    <WebOnlyColorSchemeUpdater>
      <WebOnlyPrettyScrollbar>
        <AuthProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <SessionGuard />
            {children}
          </GestureHandlerRootView>
        </AuthProvider>
      </WebOnlyPrettyScrollbar>
    </WebOnlyColorSchemeUpdater>
  );
}

export { Provider };
