import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LogBox } from 'react-native';
import Toast from 'react-native-toast-message';
import { Provider } from '@/components/Provider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useOrientationLock } from '@/hooks/useOrientationLock';

import '../global.css';

LogBox.ignoreLogs([
  "TurboModuleRegistry.getEnforcing(...): 'RNMapsAirModule' could not be found",
]);

export default function RootLayout() {
  useOrientationLock();

  return (
    <ErrorBoundary>
      <Provider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            animation: 'slide_from_right',
            gestureEnabled: true,
            gestureDirection: 'horizontal',
            headerShown: false
          }}
        >
          <Stack.Screen name="index" options={{ title: "" }} />
          <Stack.Screen name="login" options={{ title: "登录" }} />
          <Stack.Screen name="order-detail" options={{ title: "检验单详情" }} />
          <Stack.Screen name="settings" options={{ title: "系统设置" }} />
          <Stack.Screen name="login-history" options={{ title: "登录记录" }} />
          <Stack.Screen name="debug-response" options={{ title: "调试响应" }} />
        </Stack>
        <Toast />
      </Provider>
    </ErrorBoundary>
  );
}
