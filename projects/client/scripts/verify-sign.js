/**
 * 金蝶 LoginBySign 签名算法本地验证脚本
 *
 * 用法：
 *   node scripts/verify-sign.js <timestamp> <expectedSign>
 *
 * 示例（用你手里的示例时间戳和 sign 替换）：
 *   node scripts/verify-sign.js 1750580000 abcdef123456...
 *
 * 说明：
 *   本脚本使用 Node.js 原生 crypto 模块计算 SHA256，与 expo-crypto 结果一致。
 *   如果输出 sign 与 expectedSign 不同，请检查：
 *   1. 时间戳单位（秒级 vs 毫秒级）
 *   2. 参与排序的五个字段值是否与金蝶后台配置一致
 *   3. 服务端是否使用了不同的排序规则或拼接规则
 */

const crypto = require('crypto');

const ACCT_ID = '6a015236279e5b';
const USER_NAME = 'soundboxpod';
const APP_ID = '331723_QcbJ49tF0phbwV+OS67sTc1q7sWXWLoP';
const APP_SECRET = '64f63ed472534bf5b2538969f25e4777';

function generateSign(timestamp) {
  const arr = [ACCT_ID, USER_NAME, APP_ID, APP_SECRET, String(timestamp)];

  // 与 Java String.compareTo / Arrays.sort 一致：按 Unicode 码点字典序
  arr.sort((a, b) => {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  });

  const raw = arr.join('');
  const digest = crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
  return digest.toLowerCase();
}

function main() {
  const [tsArg, expectedArg] = process.argv.slice(2);

  if (!tsArg) {
    console.log('用法: node scripts/verify-sign.js <timestamp> [expectedSign]');
    console.log('');
    console.log('示例参数（当前秒级时间戳）：');
    const nowSec = Math.floor(Date.now() / 1000);
    console.log(`  时间戳: ${nowSec}`);
    console.log(`  生成sign: ${generateSign(nowSec)}`);
    console.log('');
    console.log('排序后的拼接原文示例（供比对）：');
    const arr = [ACCT_ID, USER_NAME, APP_ID, APP_SECRET, String(nowSec)];
    arr.sort((a, b) => {
      if (a < b) return -1;
      if (a > b) return 1;
      return 0;
    });
    console.log(`  ${arr.join('')}`);
    process.exit(0);
  }

  const sign = generateSign(tsArg);

  console.log('─────────────────────────────────');
  console.log(`输入时间戳: ${tsArg}`);
  console.log(`生成 sign : ${sign}`);

  if (expectedArg) {
    const match = sign.toLowerCase() === expectedArg.toLowerCase();
    console.log(`预期 sign : ${expectedArg}`);
    console.log(`比对结果  : ${match ? '✅ 一致' : '❌ 不一致'}`);
  }

  // 同时打印排序后的数组和拼接原文，方便排查
  const arr = [ACCT_ID, USER_NAME, APP_ID, APP_SECRET, String(tsArg)];
  arr.sort((a, b) => {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  });
  console.log('─────────────────────────────────');
  console.log('排序后的数组:', arr);
  console.log('拼接原文   :', arr.join(''));
}

main();
