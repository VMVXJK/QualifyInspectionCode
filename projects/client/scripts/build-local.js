/**
 * 本地 APK 构建脚本
 *
 * 解决 Windows MAX_PATH 限制问题：
 * 1. 自动将当前项目同步到 C:/app（短路径）
 * 2. 清理 Android 构建缓存
 * 3. 调用 Gradle 构建 Release APK
 * 4. 将 APK 复制到 Result/ 目录
 *
 * 用法：node scripts/build-local.js
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// ═══════════════════════════════════════════════════════════════
// 配置
// ═══════════════════════════════════════════════════════════════

const PROJECT_ROOT = path.resolve(__dirname, '..');
const BUILD_ROOT = 'C:/app';
const RESULT_DIR = path.resolve(PROJECT_ROOT, '..', '..', 'Result');

const JAVA_HOME = 'C:/app/Programtools/jdk';
const ANDROID_HOME = 'C:/app/Programtools/android-sdk';
const GRADLE_HOME = 'C:/app/Programtools/gradle-home';
const TMP_DIR = 'C:/app/Programtools/tmp';

// ═══════════════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════════════

const IS_WIN = process.platform === 'win32';
const GRADLE_CMD = './gradlew';

function run(cmd, opts = {}) {
  console.log(`\n▶ ${cmd}`);
  execSync(cmd, {
    stdio: 'inherit',
    cwd: opts.cwd || PROJECT_ROOT,
    shell: IS_WIN ? 'bash' : undefined,
    env: {
      ...process.env,
      JAVA_HOME,
      ANDROID_HOME,
      GRADLE_USER_HOME: GRADLE_HOME,
      TMP: TMP_DIR,
      TEMP: TMP_DIR,
      PATH: IS_WIN
        ? `${JAVA_HOME}/bin;${ANDROID_HOME}/cmdline-tools/latest/bin;${ANDROID_HOME}/platform-tools;${process.env.PATH}`
        : `${JAVA_HOME}/bin:${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools:${process.env.PATH}`,
      ...opts.env,
    },
  });
}

function runSilent(cmd, opts = {}) {
  return execSync(cmd, {
    encoding: 'utf-8',
    cwd: opts.cwd || PROJECT_ROOT,
    shell: IS_WIN ? 'bash' : undefined,
    env: {
      ...process.env,
      JAVA_HOME,
      ANDROID_HOME,
      GRADLE_USER_HOME: GRADLE_HOME,
      TMP: TMP_DIR,
      TEMP: TMP_DIR,
      PATH: IS_WIN
        ? `${JAVA_HOME}/bin;${ANDROID_HOME}/cmdline-tools/latest/bin;${ANDROID_HOME}/platform-tools;${process.env.PATH}`
        : `${JAVA_HOME}/bin:${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools:${process.env.PATH}`,
      ...opts.env,
    },
  });
}

function getVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf-8'));
  return pkg.version || '1.0.0';
}

// ═══════════════════════════════════════════════════════════════
// 主流程
// ═══════════════════════════════════════════════════════════════

async function main() {
  const version = getVersion();
  const apkName = `QualifyInspection-v${version}.apk`;

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  QualifyInspection 本地 APK 构建');
  console.log(`  版本: ${version}`);
  console.log('═══════════════════════════════════════════════════════════════');

  // 1. 类型检查（在源项目执行，快速失败）
  console.log('\n─── 步骤 1/5: TypeScript 类型检查 ───');
  try {
    runSilent('npx tsc --noEmit');
    console.log('✓ 类型检查通过');
  } catch (e) {
    console.error('✗ 类型检查失败，请先修复类型错误');
    process.exit(1);
  }

  // 2. 同步到 C:/app
  console.log('\n─── 步骤 2/5: 同步代码到 C:/app ───');
  const excludes = [
    'node_modules',
    '.expo',
    '.gradle',
    'android/app/build',
    'android/app/.cxx',
    'dist',
    'Result',
    '*.log',
    '.claude',
  ];

  const tarExcludeFlags = excludes.map((e) => `--exclude=${e}`).join(' ');
  runSilent(
    `tar -cf - ${tarExcludeFlags} . | (cd ${BUILD_ROOT} && tar -xf -)`,
    { cwd: PROJECT_ROOT }
  );
  console.log('✓ 同步完成');

  // 3. 清理构建缓存
  console.log('\n─── 步骤 3/5: 清理 Android 构建缓存 ───');
  try {
    runSilent('rm -rf android/app/build android/app/.cxx', { cwd: BUILD_ROOT });
    console.log('✓ 缓存清理完成');
  } catch {
    console.log('! 缓存清理跳过（可能不存在）');
  }

  // 3.5 写入 local.properties（避免 ANDROID_HOME 未被 Gradle 识别）
  // 使用正斜杠，Gradle 在 Windows 上同样兼容，且避免反斜杠转义问题
  const localPropsPath = path.join(BUILD_ROOT, 'android', 'local.properties');
  fs.writeFileSync(localPropsPath, `sdk.dir=${ANDROID_HOME}\n`);

  // 4. Gradle 构建
  console.log('\n─── 步骤 4/5: Gradle Release 构建 ───');
  run(`${GRADLE_CMD} :app:assembleRelease --no-daemon`, { cwd: path.join(BUILD_ROOT, 'android') });

  // 5. 复制 APK
  console.log('\n─── 步骤 5/5: 复制 APK 到 Result ───');
  const srcApk = path.join(BUILD_ROOT, 'android/app/build/outputs/apk/release/app-release.apk');
  const destApk = path.join(RESULT_DIR, apkName);

  if (!fs.existsSync(srcApk)) {
    console.error(`✗ 未找到 APK: ${srcApk}`);
    process.exit(1);
  }

  fs.copyFileSync(srcApk, destApk);
  console.log(`✓ APK 已复制: ${destApk}`);

  // 输出文件大小
  const stats = fs.statSync(destApk);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
  console.log(`  文件大小: ${sizeMB} MB`);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  构建成功！');
  console.log(`  ${apkName}`);
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch((err) => {
  console.error('\n构建失败:', err.message);
  process.exit(1);
});
