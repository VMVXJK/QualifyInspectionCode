const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// 确保 TypeScript 文件优先解析
config.resolver.sourceExts = [
  ...new Set([
    ...config.resolver.sourceExts,
    'ts',
    'tsx',
    'js',
    'jsx',
    'json',
  ]),
];

// 支持 @/ 别名（兼容 @react-native-community/cli bundle）
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('@/')) {
    return context.resolveRequest(
      context,
      path.resolve(__dirname, moduleName.substring(2)),
      platform
    );
  }
  return originalResolveRequest
    ? originalResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

/* ═══════════════════════════════════════════════════════════════
   TODO(临时协作开发 / LAN共享模式)
   ──────────────────────────────────────────────────────────────
   以下 server.host 配置用于小组协同开发时，允许局域网内其他电脑
   通过本机 IP 访问 Metro bundler 与 Web 预览页面。

   ⚠️ 开发完成后务必删除或注释掉下面这段代码，关闭 0.0.0.0 监听，
      防止生产/正式环境中暴露开发服务器。
   ═══════════════════════════════════════════════════════════════ */
config.server = {
  ...config.server,
  host: '0.0.0.0',
};
/* TODO END: 开发完成后删除上方 server.host 配置 */

module.exports = config;
