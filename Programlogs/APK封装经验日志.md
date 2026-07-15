# QualifyInspection APK 本地封装经验日志

> 记录时间：2026-06-17
> 记录人：Claude Code
> 项目：QualifyInspection（React Native 0.81.5 + Expo SDK 54）
> 构建平台：Windows 10 Pro
> 目标：Android APK（Release）

---

## 一、项目技术栈

| 组件 | 版本 | 说明 |
|------|------|------|
| React Native | 0.81.5 | 核心框架，启用 New Architecture（Fabric + TurboModules） |
| Expo SDK | 54 | 应用壳层，提供文件系统、屏幕方向、开屏屏等原生模块 |
| Expo Router | ~6.0.23 | 文件系统路由 |
| React Navigation | v7 | 栈导航 + 底部标签导航 |
| TypeScript | ~5.8.3 | 类型系统 |
| Metro | 0.81 | RN 打包器 |
| Android Gradle Plugin | 8.11.0 | Android 构建插件 |
| Gradle | 8.14.3 | 构建系统 |
| NDK | 27.1.12297006 | Native 开发工具包（C++ 编译） |
| CMake | 3.22.1 | C++ 构建系统 |
| JDK | 17 (Microsoft OpenJDK 17.0.19) | Java 编译器 |
| Kotlin | 2.0.21 | Android 原生代码语言 |

**关键第三方库**：
- `react-native-screens` ~4.16.0
- `react-native-reanimated` ~4.1.1
- `react-native-worklets` 0.5.1
- `react-native-gesture-handler` ~2.28.0
- `react-native-safe-area-context` ~5.6.0
- `react-native-svg` 15.12.1
- `react-native-webview` 13.15.0
- `expo-modules-core` 3.0.29

---

## 二、环境准备清单

### 2.1 JDK 17

**路径**：`C:\Users\胥骏凯\.jdks\ms-17.0.19`（原始安装位置）

**构建时使用路径**：`C:\app\Programtools\jdk`（为避免中文路径编码问题，构建前需复制到此纯 ASCII 路径）

**选择理由**：
- React Native 0.81 官方要求 JDK 17
- 不要使用 JDK 21+，AGP 8.x 对 JDK 21 的支持仍不完善
- Microsoft OpenJDK 在 Windows 上安装简单，无需配置环境变量

**环境变量**（仅在构建终端中设置）：
```bash
export JAVA_HOME="/c/app/Programtools/jdk"
export PATH="$JAVA_HOME/bin:$PATH"
```

### 2.2 Android SDK

**路径**：`QualifyInspection/Result/android-sdk/`（原始安装位置）

**构建时使用路径**：`C:\app\Programtools\android-sdk`（为避免中文路径编码问题，构建前需复制到此纯 ASCII 路径）

**必须安装的组件**：

```text
platform-tools/          # adb、fastboot 等工具
platforms/android-35/    # Android API 35 平台
build-tools/35.0.0/      # aapt、dx、zipalign 等构建工具
ndk/27.1.12297006/       # Native Development Kit（CMake 编译 C++ 必需）
cmake/3.22.1/            # CMake（AGP 8.11 配套版本）
```

**下载方式**：
1. 从 [Android Studio 下载页](https://developer.android.com/studio) 下载 Command Line Tools
2. 解压到 `cmdline-tools/latest/`
3. 使用 `sdkmanager` 安装上述组件：
   ```bash
   sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0" "ndk;27.1.12297006" "cmake;3.22.1"
   ```

**环境变量**：
```bash
export ANDROID_HOME="/c/app/Programtools/android-sdk"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
```

### 2.3 Gradle 缓存

**构建时使用路径**：`C:\app\Programtools\gradle-home`

为避免中文用户名在 Gradle 生成的 batch 脚本中出现乱码，Gradle 用户缓存目录也需放在纯 ASCII 路径：
```bash
export GRADLE_USER_HOME="/c/app/Programtools/gradle-home"
```

### 2.4 临时目录

**构建时使用路径**：`C:\app\Programtools\tmp`

Android Gradle Plugin 的 prefab/CMake 阶段会在系统临时目录生成 batch 脚本，中文用户名会导致编码错误：
```bash
export TMP="/c/app/Programtools/tmp"
export TEMP="/c/app/Programtools/tmp"
```

### 2.5 Node.js 环境

**要求**：Node.js 18+（当前使用 v24.16.0）

**项目依赖安装**：
```bash
cd projects/client
npm install
```

**额外必需的 devDependencies**（Expo 模板默认未包含）：
```bash
npm install --save-dev @react-native-community/cli
npm install --save-dev @react-native/metro-config
npm install --save expo-asset
```

> ⚠️ **注意**：Expo SDK 54 模板默认不安装 `@react-native-community/cli` 和 `@react-native/metro-config`，但 React Native 0.73+ 的 Gradle 插件在打包时会依赖它们。

---

## 三、完整封装流程

### 3.1 前置检查

1. **确认项目路径为纯英文**：
   - 项目必须位于纯英文路径下（如 `C:\QualifyInspection\projects\client`）
   - **严禁中文路径**，否则会遇到 GBK 编码、CMake 路径解析、长路径限制等连锁问题

2. **确认已创建 `index.js` 入口文件**：
   ```javascript
   // projects/client/index.js
   import 'expo-router/entry';
   ```
   > React Native Gradle 插件默认查找 `index.js` 作为打包入口。Expo 项目使用 `expo-router/entry`，必须显式创建此文件。

3. **确认 `metro.config.js` 支持 `@/` 别名**：
   ```javascript
   const { getDefaultConfig } = require('expo/metro-config');
   const path = require('path');

   const config = getDefaultConfig(__dirname);

   // 支持 @/ 别名（@react-native-community/cli bundle 必需）
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

   module.exports = config;
   ```

### 3.2 构建步骤

**步骤 1：复制项目到短路径（避免 Windows 260 字符限制）**

```bash
# 项目原始路径较长，CMake 生成的对象文件路径会超过 260 字符
# 必须复制到极短路径（如 C:\app）后再构建
robocopy "C:\Users\胥骏凯\WebstormProjects\QualifyInspection\projects\client" "C:\app" /E /MT:8
```

> 💡 **经验**：`C:\Users\胥骏凯\WebstormProjects\QualifyInspection\projects\client` 路径下，CMake 生成的对象文件完整路径可达 **335 字符**，远超 Windows 默认 260 字符限制。使用 `C:\app` 后缩短至 **235 字符**。

**步骤 2：进入构建目录**

```bash
cd /c/app/android
```

**步骤 3：设置环境变量并构建**

```bash
export JAVA_HOME="/c/Users/胥骏凯/.jdks/ms-17.0.19"
export ANDROID_HOME="/c/Users/胥骏凯/WebstormProjects/QualifyInspection/Result/android-sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

./gradlew :app:assembleRelease --no-daemon
```

**步骤 4：等待构建完成**

- 首次构建：**20-30 分钟**（需编译所有第三方库的 C++ 代码）
- 后续构建：5-10 分钟（Gradle 缓存命中）

**步骤 5：复制 APK 到输出目录**

```bash
cp /c/app/android/app/build/outputs/apk/release/app-release.apk \
   "/c/Users/胥骏凯/WebstormProjects/QualifyInspection/Result/QualifyInspection-v1.0.0.apk"
```

**步骤 6：清理临时构建副本（可选）**

```bash
rm -rf /c/app
```

---

## 四、遇到的所有问题及解决方案

### 问题 1：中文路径导致 Gradle 项目评估失败

**现象**：
```
Basedir C:\Users\胥骏凯\WebstormProjects\质检工作�?\projects\client\node_modules\react-native-screens\android does not exist
```

**根因**：
- Windows 默认控制台编码为 GBK（代码页 936）
- Gradle `providers.exec` 启动 Node.js 子进程读取 stdout 时，UTF-8 中文路径被错误编码为 GBK
- `autolinking.json` 中所有模块路径变成乱码

**解决方案**：
1. **最根本方案**：将项目目录重命名为纯英文（如 `QualifyInspection`）
2. **临时补丁**（如无法重命名）：
   - 修改 `node_modules/expo-modules-autolinking/build/commands/resolveCommand.js`，添加 `--output` 参数，将 JSON 写入临时文件而非 stdout
   - 修改 `node_modules/@react-native/gradle-plugin/settings-plugin/src/main/kotlin/com/facebook/react/ReactSettingsExtension.kt`，读取临时文件而非 stdout

> ✅ **最终采用方案 1**，重命名后所有编码问题自动消失。

---

### 问题 2：JVM `sun.jnu.encoding=GBK` 导致文件路径编码错误

**现象**：
- Gradle `properties` 任务输出中，`projectDir` 显示为乱码
- 外部进程（CMake、Ninja）接收到的路径参数包含乱码字符

**根因**：
- JVM 默认使用系统编码 `sun.jnu.encoding=GBK` 与 Windows 文件系统交互
- `file.encoding=UTF-8` 只影响 Java 内部字符串编码，不影响 `File.getAbsolutePath()`

**解决方案**：
```bash
export JAVA_TOOL_OPTIONS="-Dsun.jnu.encoding=UTF-8 -Dfile.encoding=UTF-8"
```

> ⚠️ **注意**：`gradle.properties` 中的 `org.gradle.jvmargs` 不够早，必须在启动 JVM 前通过 `JAVA_TOOL_OPTIONS` 环境变量设置。

> ✅ 重命名为英文路径后，此问题不再出现。

---

### 问题 3：CMake/NDK 在中文路径下编译失败

**现象**：
```
clang: error: unable to execute command: unspecified system_category error
clang: error: linker command failed with exit code 1
```

**根因**：
- NDK 的 Clang 工具链在调用 `ld.lld` 时，路径参数中的中文字符被错误编码
- `CreateProcessW` 虽然支持 Unicode，但 Clang 内部某些环节使用了 ANSI API

**解决方案**：
1. **根本方案**：英文路径
2. **临时 workaround**（NDK 部分）：
   - 创建 Junction 将 NDK 映射到纯英文路径：
     ```cmd
     mklink /J C:\android-ndk\27.1.12297006 C:\...\Result\android-sdk\ndk\27.1.12297006
     ```
   - 在 `android/build.gradle` 中显式设置 `ndkPath = "C:/android-ndk/27.1.12297006"`

> ✅ 重命名为英文路径后，此问题不再出现。

---

### 问题 4：Windows 长路径限制（MAX_PATH = 260）

**现象**：
```
ninja: error: Stat(...): Filename longer than 260 characters
```

**根因**：
- CMake 生成的对象文件名包含源码完整绝对路径（将 `\` 替换为 `_`）
- `C:\Users\胥骏凯\WebstormProjects\QualifyInspection\projects\client\node_modules\react-native-safe-area-context\...` 路径过长
- 对象文件完整路径 = `.cxx` 前缀（~160 字符）+ 编码后的源码路径（~175 字符）= **335 字符**

**解决方案**：
1. **构建时复制到短路径**：
   ```bash
   robocopy "C:\...\QualifyInspection\projects\client" "C:\app" /E /MT:8
   cd C:\app\android
   ./gradlew :app:assembleRelease
   ```
   使用 `C:\app` 后总长度降至 **235 字符**。

2. **启用 Windows 长路径支持**（备选，需重启）：
   - 修改注册表：`HKLM\SYSTEM\CurrentControlSet\Control\FileSystem\LongPathsEnabled = 1`
   - 重启系统
   - 确保 CMake、Ninja、Clang 均支持长路径（NDK 27+ 通常支持）

> ✅ **采用方案 1**，无需重启，立即可用。

---

### 问题 5：`@expo/cli` 不支持 `export:embed` 命令

**现象**：
```
error: unknown command 'export:embed'
```

**根因**：
- `app/build.gradle` 中配置了 `bundleCommand = "export:embed"` 和 `cliFile = file("../../node_modules/@expo/cli")`
- Expo CLI 的命令列表为 `start, export, run:ios, run:android, prebuild, install, customize, config, serve...`，没有 `export:embed`

**解决方案**：
```gradle
// app/build.gradle
react {
    // 使用标准 React Native CLI 进行 bundle
    // cliFile = file("../../node_modules/@expo/cli")
    // bundleCommand = "export:embed"
}
```

注释掉这两行后，React Native Gradle 插件会默认使用 `react-native bundle` 命令。

---

### 问题 6：Metro 无法解析 `@/` 别名

**现象**：
```
Unable to resolve module @/components/Provider from ...\app\_layout.tsx
```

**根因**：
- `tsconfig.json` 中配置了 `"paths": { "@/*": ["./*"] }`
- Expo 开发服务器（`npx expo start`）能自动识别 `tsconfig.json` 的 paths
- 但 `@react-native-community/cli` 的 `bundle` 命令使用 `@react-native/metro-config`，不会自动读取 `tsconfig.json`

**解决方案**：
在 `metro.config.js` 中显式配置 `resolveRequest`：
```javascript
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
```

> ⚠️ `config.resolver.extraNodeModules = { '@': path.resolve(__dirname) }` **无效**，因为 Metro 解析 `@/foo` 时不会将 `@` 作为包名解析。

---

### 问题 7：缺少 `expo-asset` 模块

**现象**：
```
Unable to resolve module expo-asset from ...\node_modules\expo-font\build\FontLoader.js
```

**根因**：
- `expo-font` 依赖 `expo-asset`，但 `package.json` 中未显式声明
- Expo 开发时通过 `expo` 主包隐式提供，但 `bundle` 命令需要显式安装

**解决方案**：
安装与当前 Expo SDK 兼容的版本。Expo SDK 54 对应的 `expo-asset` 版本约为 `~12.0.x`（与 `expo` 主包的 `dependencies` 中声明的版本一致）：
```bash
npm install --save expo-asset@~12.0.12
```

> ⚠️ **不要安装最新版**。`expo-asset@56.x` 要求 `expo-modules-core` 中包含 `AnyTypeCache` 类，而 SDK 54 的 `expo-modules-core@3.0.29` 没有该类，会导致运行时崩溃（见问题 10）。

---

### 问题 10：运行时崩溃 `NoClassDefFoundError: expo.modules.kotlin.types.AnyTypeCache`

**现象**：
APK 安装后启动立即崩溃，Logcat 报错：
```
java.lang.NoClassDefFoundError: Failed resolution of: Lexpo/modules/kotlin/types/AnyTypeCache;
    at expo.modules.asset.AssetModule.definition(AssetModule.kt:125)
    ...
Caused by: java.lang.ClassNotFoundException: expo.modules.kotlin.types.AnyTypeCache
```

**根因**：
- `expo-asset` 版本与 Expo SDK 不匹配
- 安装了 `expo-asset@56.x`（最新版），但它依赖 `expo-modules-core` 中较新的 `AnyTypeCache` 类
- APK 实际打包的 `expo-modules-core@3.0.29`（SDK 54 配套）缺少该类

**解决方案**：
将 `package.json` 中的 `expo-asset` 降级到与 `expo` 主包一致的版本：
```json
"expo-asset": "~12.0.12"
```
然后重新安装依赖并构建：
```bash
rm -rf node_modules/expo-asset package-lock.json
npm install
cd android && ./gradlew :app:assembleRelease
```

> 💡 **最佳实践**：安装 Expo 模块时，版本号应与 `expo` 主包 `node_modules/expo/package.json` 中 `dependencies` 声明的版本保持一致，或查阅 [Expo SDK 版本对照表](https://docs.expo.dev/versions/latest/)。

---

### 问题 8：`react-native-reanimated` 与 `react-native-worklets` 的 `.so` 冲突

**现象**：
```
2 files found with path 'lib/arm64-v8a/libworklets.so' from inputs:
  - ...\react-native-reanimated\android\build\...\libworklets.so
  - ...\react-native-worklets\android\build\...\libworklets.so
```

**根因**：
- `react-native-reanimated` 4.x 内部集成了 Worklets 引擎
- `react-native-worklets` 0.5.1 作为独立包也提供了 `libworklets.so`
- 两个包都输出同名原生库，导致 `mergeReleaseNativeLibs` 冲突

**解决方案**：
在 `android/app/build.gradle` 的 `packagingOptions` 中使用 `pickFirst`：
```gradle
android {
    packagingOptions {
        pickFirst '**/libworklets.so'
    }
}
```

> 💡 此冲突只影响 New Architecture（`newArchEnabled=true`）。旧架构下 Reanimated 不编译独立 Worklets 库。

---

### 问题 9：`robocopy` 排除 `build` 目录时误删 `node_modules` 编译产物

**现象**：
```
Error: Cannot find module '../build'
Require stack:
- ...\node_modules\expo-modules-autolinking\bin\expo-modules-autolinking.js
```

**根因**：
```bash
robocopy ... /XD build
```
`/XD build` 会递归排除**所有**名为 `build` 的目录，包括 `node_modules/expo-modules-autolinking/build/`、`node_modules/@react-native/gradle-plugin/settings-plugin/build/` 等。

**解决方案**：
只排除项目级别的 `build` 目录：
```bash
robocopy "src" "dst" /E /XD .gradle "android\build" "app\build" .cxx node_modules\.cache
```

或使用 `/MIR` 后手动删除不需要的目录。

---

### 问题 11：运行时弹窗 `Property 'DOMException' doesn't exist`

**现象**：
进入登录页面或发起网络请求时，弹出红屏错误：
```
Property 'DOMException' doesn't exist
```

**根因**：
- `AbortController` 超时后，代码中用 `instanceof DOMException` 判断错误类型
- `DOMException` 是浏览器/Web 标准全局对象，React Native 的 JavaScript 引擎（Hermes/JSC）**没有提供**
- 即使在浏览器环境中 `fetch` 会抛出 `DOMException`，React Native 的 `fetch` polyfill 也不会

**解决方案**：
不再使用 `instanceof DOMException`，改为检查 `error.name`：
```typescript
function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as Record<string, unknown>).name === 'AbortError'
  );
}
```

将 `api/client.ts` 和 `api/kingdee/client.ts` 中所有 `error instanceof DOMException && error.name === 'AbortError'` 替换为 `isAbortError(error)`。

> ⚠️ **React Native 与 Web 差异速记**：`DOMException`、`localStorage`、`window`、`document` 等浏览器 API 在 RN 中均不可用。网络请求错误判断应使用类型守卫而非 `instanceof` 全局类。

---

### 问题 12：登录时提示"网络异常，无法连接到金蝶服务器"

**现象**：
- 登录页点击登录后弹窗："网络异常，无法连接到金蝶服务器"
- 手机浏览器访问 `https://121.37.216.69/K3Cloud/` 可以打开，但提示**"不安全"**

**根因**：
- 金蝶服务器使用**自签名证书**或**IP 地址证书**，Android 系统默认不信任
- React Native 的 `fetch` 在 SSL 握手阶段直接失败，不像浏览器可以手动"继续前往"

**解决方案**：

**步骤 1：创建 Android 网络安全配置**

新建 `android/app/src/main/res/xml/network_security_config.xml`：
```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">121.37.216.69</domain>
        <trust-anchors>
            <certificates src="system"/>
            <certificates src="user"/>
        </trust-anchors>
    </domain-config>
</network-security-config>
```

**步骤 2：在 AndroidManifest.xml 中引用**

在 `android/app/src/main/AndroidManifest.xml` 的 `<application>` 标签添加：
```xml
android:networkSecurityConfig="@xml/network_security_config"
```

**步骤 3（如金蝶仅支持 HTTPS）：安装服务器证书到手机**

1. 在手机浏览器中打开 `https://121.37.216.69/K3Cloud/`
2. 点击地址栏的🔒图标 → **证书** → 导出/保存为 `.cer` 文件
3. 进入手机 **设置 → 安全 → 从存储安装证书 → CA 证书**，选择下载的 `.cer` 文件
4. 安装后应用即可信任该证书

> 💡 **配置说明**：
> - `cleartextTrafficPermitted="true"`：允许对该域名使用明文 HTTP（若金蝶支持 HTTP 可直接连通）
> - `src="user"`：信任用户在手机设置中手动安装的证书
> - `src="system"`：信任系统预装的 CA 证书（保持正常 HTTPS 访问）

**备选方案（证书过期/无法安装时）：在原生层绕过 SSL 验证**

如果服务器证书已过期或无法导出安装，可在 `MainApplication.kt` 中配置 OkHttp **信任所有证书**（仅限内网测试环境）：

```kotlin
import com.facebook.react.modules.network.OkHttpClientFactory
import com.facebook.react.modules.network.OkHttpClientProvider
import okhttp3.OkHttpClient
import java.security.cert.X509Certificate
import javax.net.ssl.SSLContext
import javax.net.ssl.X509TrustManager

// 在 onCreate() 中，loadReactNative(this) 之前调用：
try {
    val trustAllCerts = arrayOf<X509TrustManager>(object : X509TrustManager {
        override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {}
        override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {}
        override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
    })
    val sslContext = SSLContext.getInstance("SSL")
    sslContext.init(null, trustAllCerts, java.security.SecureRandom())
    OkHttpClientProvider.setOkHttpClientFactory(object : OkHttpClientFactory {
        override fun createNewNetworkModuleClient(): OkHttpClient {
            return OkHttpClient.Builder()
                .sslSocketFactory(sslContext.socketFactory, trustAllCerts[0])
                .hostnameVerifier { _, _ -> true }
                .build()
        }
    })
} catch (e: Exception) {
    e.printStackTrace()
}
```

> ⚠️ **安全警告**：此代码会禁用所有 HTTPS 证书验证，**仅限内网测试/开发环境使用**。生产环境必须使用受信任 CA 签发的证书，并删除此段代码。

---

### 问题 13：项目转移到中文用户名目录后，Gradle/CMake 构建失败（`CXX1429` / `prefab failed`）

**现象**：
项目从 `C:\Users\User` 转移到 `C:\Users\胥骏凯` 后，构建时反复报错：
```
> Task :react-native-screens:configureCMakeRelWithDebInfo[arm64-v8a] FAILED
> [CXX1429] error when building with cmake using ...\CMakeLists.txt:
    C++ build system [prefab] failed while executing:
      @echo off
      "C:\\Users\\����\\.jdks\\ms-17.0.19\\bin\\java" ^
        --class-path ^
        "C:\\Users\\����\\.gradle\\caches\\...\\cli-2.1.0-all.jar" ^
        ...
```

**根因**：
- Android Gradle Plugin 在生成 CMake/Prefab 用的 batch 脚本时，使用了包含中文用户名的绝对路径
- Windows batch 脚本默认使用系统 ANSI 编码（GBK），而 Gradle 生成的脚本中的 UTF-8 中文字符被错误解析为乱码
- 导致 `java.exe` 路径、`prefab.jar` 路径、临时目录路径全部变成乱码，prefab 无法执行

**解决方案**：

**根本方案**：将所有构建工具复制到纯 ASCII 短路径，构建时通过环境变量指向这些路径。

1. 在 `C:\app` 下新建 `Programtools` 目录：
   ```
   C:\app\Programtools\
   ├── jdk/              # 从 C:\Users\胥骏凯\.jdks\ms-17.0.19 复制
   ├── android-sdk/      # 从 Result\android-sdk 复制
   ├── gradle-home/      # 从 C:\Users\胥骏凯\.gradle 复制
   └── tmp/              # 新建空目录
   ```

2. 构建前设置环境变量：
   ```bash
   export JAVA_HOME="/c/app/Programtools/jdk"
   export ANDROID_HOME="/c/app/Programtools/android-sdk"
   export GRADLE_USER_HOME="/c/app/Programtools/gradle-home"
   export TMP="/c/app/Programtools/tmp"
   export TEMP="/c/app/Programtools/tmp"
   ```

3. `scripts/build-local.js` 已更新为自动使用上述路径。

> 💡 **为什么只在 `C:\app` 下放工具，而不是直接安装到 `C:\jdk` 等散落目录？**
> - 便于集中管理和备份
> - 明确区分"原始安装位置"和"构建工作位置"
> - 与 `C:\app`（构建工作区）形成统一整体

---

### 问题 14：金蝶 LoginBySign 登录 API 更新为动态签名

**背景**：
金蝶服务器更新了 `LoginBySign` 接口的鉴权方式，要求每次请求携带动态生成的时间戳和 SHA256 签名，而不是使用固定的签名字符串。

**签名规则**：
1. 将 **acctid**、**账号名**、**应用ID**、**应用秘钥**、**时间戳** 放到数组
2. 按 Java `Arrays.sort(stringArray)` 排序（字符串自然顺序）
3. 排序后拼接成一个字符串
4. 使用 SHA256 加密，结果转小写

**请求格式**：
```json
{
  "parameters": [
    "6a015236279e5b",
    "soundboxpod",
    "331723_QcbJ49tF0phbwV+OS67sTc1q7sWXWLoP",
    "1782091781",
    "52ae0bf4c9b98b2022485547ce9b748ecc5e3b5d169b3022df3c70216b9edc64",
    2052
  ]
}
```

**参数说明**：
| 位置 | 字段 | 值 | 说明 |
|------|------|-----|------|
| 1 | acctid | `6a015236279e5b` | 固定账套ID |
| 2 | username | `soundboxpod` | 固定账号名 |
| 3 | appId | `331723_QcbJ49tF0phbwV+OS67sTc1q7sWXWLoP` | 固定应用ID |
| 4 | timestamp | 动态生成 | `Math.floor(Date.now() / 1000)`，Unix秒级时间戳 |
| 5 | sign | 动态生成 | SHA256(排序后拼接的字符串) |
| 6 | lcid | `2052` | 固定中文语言标识 |

**代码实现**（`api/kingdee/auth.ts`）：
```typescript
import * as Crypto from 'expo-crypto';

const ACCT_ID = '6a015236279e5b';
const USER_NAME = 'soundboxpod';
const APP_ID = '331723_QcbJ49tF0phbwV+OS67sTc1q7sWXWLoP';
const APP_SECRET = '3cc198d20f584470be261f700cf0cc41';
const LCID = 2052;

async function generateSign(timestamp: number): Promise<string> {
  const arr = [ACCT_ID, USER_NAME, APP_ID, APP_SECRET, String(timestamp)];
  arr.sort((a, b) => a.localeCompare(b)); // Java Arrays.sort 等价
  const raw = arr.join('');
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    raw
  );
  return digest.toLowerCase();
}

export async function loginBySign(): Promise<KingdeeLoginResult> {
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = await generateSign(timestamp);
  const params = [ACCT_ID, USER_NAME, APP_ID, String(timestamp), sign, LCID];
  // POST { parameters: params } ...
}
```

> 💡 `expo-crypto` 已在项目依赖中（`expo-crypto@~15.0.9`），无需额外安装。

---

## 五、关键修改文件清单

| 文件 | 修改说明 | 是否持久化 |
|------|----------|------------|
| `projects/client/android/settings.gradle` | 硬编码 `includeBuild` 路径、添加 `dependencyResolutionManagement` 强制 AGP 8.11.0 | ✅ 持久化 |
| `projects/client/android/build.gradle` | 内联 `expo-root-project` 属性（绕过插件加载问题） | ✅ 持久化 |
| `projects/client/android/app/build.gradle` | 硬编码 `reactNativeDir`/`cliFile`/`codegenDir`、移除 `export:embed`、添加 `pickFirst '**/libworklets.so'` | ✅ 持久化 |
| `projects/client/android/gradle.properties` | 添加 `android.overridePathCheck=true`、`newArchEnabled=true` | ✅ 持久化 |
| `projects/client/metro.config.js` | 添加 `resolveRequest` 支持 `@/` 别名 | ✅ 持久化 |
| `projects/client/index.js` | 创建入口文件 `import 'expo-router/entry'` | ✅ 持久化 |
| `projects/client/package.json` | 添加 `@react-native-community/cli`、`@react-native/metro-config`；修正 `expo-asset` 版本为 `~12.0.12` | ✅ 持久化 |
| `projects/client/api/client.ts` | 移除 `instanceof DOMException`，改用 `isAbortError()` 类型守卫 | ✅ 持久化 |
| `projects/client/api/kingdee/client.ts` | 同上，适配 React Native 无 `DOMException` 环境；配置 `network_security_config.xml` | ✅ 持久化 |
| `projects/client/api/kingdee/auth.ts` | 重写 `LoginBySign` 为数组参数格式 `{"parameters":[...]}`，直接发请求 | ✅ 持久化 |
| `projects/client/android/app/src/main/AndroidManifest.xml` | 添加 `android:networkSecurityConfig` 属性 | ✅ 持久化 |
| `projects/client/android/app/src/main/res/xml/network_security_config.xml` | 新建：允许明文 HTTP + 信任用户证书 | ✅ 持久化 |
| `projects/client/android/app/src/main/java/.../MainApplication.kt` | 配置 OkHttp 信任所有证书（内网测试绕过 SSL） | ✅ 持久化 |
| `projects/client/api/kingdee/auth.ts` | 更新 `LoginBySign` 为动态时间戳+SHA256签名机制 | ✅ 持久化 |
| `projects/client/scripts/build-local.js` | 构建脚本：环境变量指向 `C:/app/Programtools/` 下各工具 | ✅ 持久化 |
| `node_modules/expo-modules-autolinking/build/commands/reactNativeConfigCommand.js` | 添加 `--output` 参数 | ⚠️ node_modules（重命名后无需） |
| `node_modules/@react-native/gradle-plugin/.../ReactSettingsExtension.kt` | 使用 `--output` 临时文件读取 | ⚠️ node_modules（重命名后无需） |

---

## 六、构建参数速查

### Gradle 构建命令
```bash
cd /c/app/android

export JAVA_HOME="/c/app/Programtools/jdk"
export ANDROID_HOME="/c/app/Programtools/android-sdk"
export GRADLE_USER_HOME="/c/app/Programtools/gradle-home"
export TMP="/c/app/Programtools/tmp"
export TEMP="/c/app/Programtools/tmp"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

./gradlew :app:assembleRelease --no-daemon
```

### 输出路径
- **APK**：`/c/app/android/app/build/outputs/apk/release/app-release.apk`
- **AAB**（如需 Google Play）：`./gradlew :app:bundleRelease`

### 仅构建特定架构（加速测试）
```bash
./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a
```

---

## 七、故障排查速查表

| 症状 | 可能原因 | 解决方案 |
|------|----------|----------|
| `No matching variant ... No variants exist` | `autolinking.json` 路径乱码 | 清除 `.gradle` 和 `build/generated/autolinking`，确保英文路径 |
| `Filename longer than 260 characters` | Windows MAX_PATH 限制 | 复制到 `C:\app` 短路径构建 |
| `Cannot resolve module @/...` | Metro 未配置 `@/` 别名 | 检查 `metro.config.js` 的 `resolveRequest` |
| `unknown command 'export:embed'` | `@expo/cli` 不支持此命令 | 注释 `app/build.gradle` 中的 `cliFile` 和 `bundleCommand` |
| `Cannot find module '../build'` | `robocopy /XD build` 误删 | 重新 `npm install` 或精确排除目录 |
| `2 files found with path 'libworklets.so'` | Reanimated 与 Worklets 冲突 | 添加 `pickFirst '**/libworklets.so'` |
| `cmake.exe finished with non-zero exit value 1` | NDK 路径含中文或过长 | 英文路径 + `C:\app` 短路径 |
| `Unable to resolve module expo-asset` | 未安装 `expo-asset` 或版本不兼容 | 安装 SDK 兼容版本：`npm install --save expo-asset@~12.0.12` |
| `Cannot resolve @react-native/metro-config` | 缺少 devDependency | `npm install --save-dev @react-native/metro-config` |
| 运行时崩溃 `NoClassDefFoundError: AnyTypeCache` | `expo-asset` 版本过高，与 `expo-modules-core` 不匹配 | 降级 `expo-asset` 到 `~12.0.12`，重新构建 |
| 运行时弹窗 `Property 'DOMException' doesn't exist` | RN 无 `DOMException` 全局对象 | 改用 `error.name === 'AbortError'` 判断，不用 `instanceof` |
| 登录提示"无法连接到金蝶服务器"但浏览器可打开 | 金蝶使用自签名/IP 证书，Android 不信任 | 配置 `network_security_config.xml` + 手机安装服务器证书 |
| 项目转移后构建失败 `CXX1429` / `prefab failed` | 中文用户名在 Gradle batch 脚本中乱码 | 将 JDK/Android SDK/Gradle 缓存复制到 `C:\app\Programtools\` 纯 ASCII 路径 |
| 登录提示"登录失败，结果码：0" | sign 生成不正确或时间戳过期 | 检查 `generateSign` 排序逻辑是否与 Java `Arrays.sort` 一致；确认应用秘钥正确 |

---

## 八、最佳实践与建议

### 8.1 路径管理
1. **永远使用纯英文路径**。这是 Windows 本地构建的第一原则。
2. **避免深层嵌套**。即使英文路径，超过 150 字符仍可能触发 CMake 警告。
3. **构建副本策略**：原始项目保留在 `WebstormProjects/QualifyInspection/projects/client/`，构建时复制到 `C:\app`，构建后仅保留 APK。

### 8.2 缓存管理
1. **Gradle 缓存**：`~/.gradle/caches/` 可安全删除，Gradle 会自动重建
2. **Android 构建缓存**：`projects/client/android/.gradle/` 和 `projects/client/android/app/build/` 可删除
3. **CMake 缓存**：`node_modules/*/android/.cxx/` 可删除，CMake 会重新配置
4. **不要全局删除 `node_modules/*/android/build/`**：会误删编译产物，导致 `.so` 缺失

### 8.3 版本锁定
1. **锁定 NDK 版本**：在 `android/build.gradle` 的 `ext` 中显式声明 `ndkVersion`
2. **锁定 AGP 版本**：在 `settings.gradle` 的 `dependencyResolutionManagement` 中使用 `force`
3. **锁定 Gradle 版本**：通过 `android/gradle/wrapper/gradle-wrapper.properties`

### 8.4 备选方案
如果本地构建持续遇到问题，**EAS 云端构建**是最可靠的备选：
```bash
cd projects/client
eas login
eas build:configure
eas build -p android --profile preview
```
优势：Linux 环境、无 Windows 路径问题、无需本地 NDK。

---

## 九、附录：项目目录结构参考

```
QualifyInspection/
├── projects/
│   └── client/              # 项目源码
│       ├── android/         # Android 原生项目
│       ├── app/             # Expo Router 路由层
│       ├── screens/         # 页面实现
│       ├── components/      # 公共组件
│       ├── api/             # 金蝶 API 封装
│       ├── node_modules/    # npm 依赖
│       ├── index.js         # RN 打包入口
│       ├── metro.config.js  # Metro 配置
│       ├── package.json     # 依赖清单
│       └── tsconfig.json    # TypeScript 配置
├── Result/                  # 构建输出目录
│   ├── QualifyInspection-v1.0.x.apk
│   ├── android-sdk/         # Android SDK 原始安装位置
│   ├── BUILD-FAILURE-LOG.md # 构建记录
│   ├── README.md            # 说明文档
│   └── EAS-云端构建指南.md
├── Programlogs/             # 经验日志
│   └── APK封装经验日志.md   # 本文件
├── .claude/                 # Claude Code 配置
│   └── memory/              # 项目记忆
└── C:/app/                  # 构建工作区（短路径，与源码同步）
    ├── Programtools/        # 构建工具集中存放（纯 ASCII 路径）
    │   ├── jdk/             # JDK 17
    │   ├── android-sdk/     # Android SDK（构建用副本）
    │   ├── gradle-home/     # Gradle 缓存
    │   └── tmp/             # 临时目录
    ├── android/
    └── ...                  # 同步后的源码
```

---

> 本文档应随项目迭代持续更新。如有新的构建问题或解决方案，请补充到对应章节。
