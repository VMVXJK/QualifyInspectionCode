import { Alert, Platform } from 'react-native';

/**
 * 跨平台 Alert 封装
 * 统一使用 Alert.alert，在 Web 端通过 react-native-web 的 polyfill 处理
 */

export function showAlert(title: string, message?: string): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(message ? `${title}\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

export function showConfirm(title: string, message?: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const ok = window.confirm(message ? `${title}\n${message}` : title);
      resolve(ok);
      return;
    }

    Alert.alert(
      title,
      message,
      [
        { text: '取消', style: 'cancel', onPress: () => resolve(false) },
        { text: '确定', onPress: () => resolve(true) },
      ],
      { cancelable: false }
    );
  });
}
