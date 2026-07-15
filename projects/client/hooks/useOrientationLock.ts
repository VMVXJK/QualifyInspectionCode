import { useEffect } from 'react';
import { Dimensions } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';

/**
 * 设备方向锁定
 * - 手机（屏幕短边 < 600）：锁定竖屏，不可横屏
 * - 平板（屏幕短边 >= 600）：允许横竖屏自由旋转
 */
export function useOrientationLock() {
  useEffect(() => {
    const applyLock = async () => {
      const { width, height } = Dimensions.get('window');
      const minSize = Math.min(width, height);

      if (minSize < 600) {
        // 手机：锁定竖屏
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      } else {
        // 平板：解锁，允许所有方向
        await ScreenOrientation.unlockAsync();
      }
    };

    applyLock();

    // 监听尺寸变化（旋转时重新判断）
    const subscription = Dimensions.addEventListener('change', () => {
      applyLock();
    });

    return () => {
      subscription?.remove();
    };
  }, []);
}
