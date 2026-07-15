import Toast from 'react-native-toast-message';

/**
 * Toast 消息封装
 * 已在 app/_layout.tsx 中全局挂载 <Toast />
 */

export function showSuccess(message: string) {
  Toast.show({
    type: 'success',
    text1: '成功',
    text2: message,
    position: 'top',
    visibilityTime: 2500,
  });
}

export function showError(message: string) {
  Toast.show({
    type: 'error',
    text1: '错误',
    text2: message,
    position: 'top',
    visibilityTime: 3000,
  });
}

export function showInfo(message: string) {
  Toast.show({
    type: 'info',
    text1: '提示',
    text2: message,
    position: 'top',
    visibilityTime: 2500,
  });
}
