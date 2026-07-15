import { useWindowDimensions } from 'react-native';

/**
 * 响应式 Hook — 替代模块级 Dimensions.get('window')
 * 在平板旋转时自动重新计算
 */
export function useResponsive() {
  const { width, height, fontScale } = useWindowDimensions();

  const isPortrait = height >= width;
  const minSize = Math.min(width, height);
  const isPhone = minSize < 600;
  const isTablet = minSize >= 600;

  // 动态计算内边距
  const padding = {
    large: isPortrait ? 16 : 12,
    medium: isPortrait ? 12 : 10,
    small: isPortrait ? 8 : 6,
  };

  // 动态计算字体大小
  const fontSize = {
    title: isPortrait ? 22 : 20,
    subtitle: isPortrait ? 16 : 14,
    body: isPortrait ? 15 : 13,
    caption: isPortrait ? 12 : 11,
  };

  // 内容区宽度（竖屏手机居中）
  const contentWidth = isPortrait ? width * 0.65 : width;

  return {
    width,
    height,
    fontScale,
    isPortrait,
    isPhone,
    isTablet,
    padding,
    fontSize,
    contentWidth,
  };
}
