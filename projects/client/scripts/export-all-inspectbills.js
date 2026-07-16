/**
 * 全量导出金蝶 QM_InspectBill 检验单（含物料信息）为 Markdown 报表
 *
 * 用法：
 *   node scripts/export-all-inspectbills.js
 *
 * 输出：
 *   ../../Programlogs/金蝶检验单全量数据导出.md
 *
 * 字段与登录方式详见 Programlogs/金蝶检验单物料名称获取流程.md：
 * - 登录后只使用 Set-Cookie 头解析出的原始 Cookie，避免被响应体 KDSVCSessionId 覆盖
 * - BillQuery 分录业务字段（物料/数量/单位）无需 FEntity_ 前缀，直接用字段 Key + 点号访问关联属性
 * - 服务器证书签发给 *.gzsoundbox.com，但本脚本通过 IP 121.37.216.69 访问，
 *   会触发 hostname 不匹配，因此使用 rejectUnauthorized: false 仅绕过证书校验（本地一次性导出脚本，非生产代码）
 */

const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const HOST = '121.37.216.69';
const insecureAgent = new https.Agent({ rejectUnauthorized: false });

const ACCT_ID = '6a015236279e5b';
const USER_NAME = 'soundboxpod';
const APP_ID = '331723_QcbJ49tF0phbwV+OS67sTc1q7sWXWLoP';
const APP_SECRET = '64f63ed472534bf5b2538969f25e4777';
const LCID = 2052;

const FORM_ID = 'QM_InspectBill';
const FIELD_KEYS = [
  'FID',
  'FBILLNO',
  'FDate',
  'FBILLTYPEID.FNumber',
  'FBILLTYPEID.FName',
  'FDocumentStatus',
  'FMaterialId.FNumber',
  'FMaterialId.FName',
  'FInspectQty',
  'FUnitID.FNumber',
].join(',');

const STATUS_LABEL = {
  Z: '创建',
  A: '审核中',
  B: '已审核',
  C: '重新审核',
  D: '已作废',
};

const BILL_TYPE_FALLBACK = {
  JYD001_SYS: '来料检验',
  JYD002_SYS: '过程检验',
  JYD003_SYS: '出货检验',
};

function postJson(urlPath, bodyObj, cookie) {
  const body = JSON.stringify(bodyObj);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: HOST,
        port: 443,
        path: urlPath,
        method: 'POST',
        agent: insecureAgent,
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'Content-Length': Buffer.byteLength(body),
          ...(cookie ? { Cookie: cookie } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function generateSign(timestamp) {
  const arr = [ACCT_ID, USER_NAME, APP_ID, APP_SECRET, String(timestamp)];
  arr.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return crypto.createHash('sha256').update(arr.join(''), 'utf8').digest('hex').toLowerCase();
}

async function login() {
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = generateSign(timestamp);
  const params = [ACCT_ID, USER_NAME, APP_ID, String(timestamp), sign, LCID];

  const res = await postJson(
    '/K3Cloud/Kingdee.BOS.WebApi.ServicesStub.AuthService.LoginBySign.common.kdsvc',
    { parameters: params }
  );

  const setCookie = res.headers['set-cookie'];
  if (!setCookie || setCookie.length === 0) {
    throw new Error(`登录失败：未收到 Set-Cookie，响应：${res.body}`);
  }
  const cookie = setCookie[0].split(';')[0];

  let parsedBody;
  try {
    parsedBody = JSON.parse(res.body);
  } catch {
    parsedBody = null;
  }
  if (
    parsedBody &&
    typeof parsedBody === 'object' &&
    parsedBody.LoginResultType !== 1 &&
    parsedBody.LoginResultType !== -5
  ) {
    throw new Error(`登录失败：${parsedBody.Message || JSON.stringify(parsedBody)}`);
  }

  return cookie;
}

function extractErrorMessage(parsed) {
  const rs = parsed?.ResponseStatus ?? parsed?.Result?.ResponseStatus;
  if (rs && (rs.IsSuccess === false || rs.IsSuccess === 'false')) {
    return rs.Errors?.[0]?.Message || '查询失败（无详细信息）';
  }
  return undefined;
}

async function queryPage(cookie, startRow, limit) {
  const requestBody = {
    data: {
      FormId: FORM_ID,
      FieldKeys: FIELD_KEYS,
      FilterString: '',
      OrderString: ' FDate DESC ',
      StartRow: startRow,
      Limit: limit,
    },
  };

  const res = await postJson(
    '/K3Cloud/Kingdee.BOS.WebApi.ServicesStub.DynamicFormService.BillQuery.common.kdsvc',
    requestBody,
    cookie
  );

  let parsed;
  try {
    parsed = JSON.parse(res.body);
  } catch {
    throw new Error(`BillQuery 返回非 JSON：${res.body.slice(0, 300)}`);
  }

  if (Array.isArray(parsed)) return parsed;

  const errMsg = extractErrorMessage(parsed);
  if (errMsg) throw new Error(errMsg);

  throw new Error(`BillQuery 返回格式异常：${JSON.stringify(parsed).slice(0, 300)}`);
}

async function queryAll(cookie) {
  const limit = 2000;
  let startRow = 0;
  let all = [];
  while (true) {
    const rows = await queryPage(cookie, startRow, limit);
    all = all.concat(rows);
    console.log(`  已拉取 ${all.length} 行分录（本页 ${rows.length} 行）`);
    if (rows.length < limit) break;
    startRow += limit;
  }
  return all;
}

function resolveTypeName(typeCode, typeNameFromKd) {
  if (typeNameFromKd) return typeNameFromKd;
  return BILL_TYPE_FALLBACK[typeCode] || typeCode || '';
}

function aggregateByBill(rows) {
  const billMap = new Map();
  for (const row of rows) {
    const fid = String(row.FID ?? '');
    if (!billMap.has(fid)) {
      billMap.set(fid, {
        fid,
        billNo: row['FBILLNO'] ?? '',
        date: row['FDate'] ?? '',
        typeCode: row['FBILLTYPEID.FNumber'] ?? '',
        typeName: resolveTypeName(row['FBILLTYPEID.FNumber'], row['FBILLTYPEID.FName']),
        status: row['FDocumentStatus'] ?? '',
        materials: [],
      });
    }
    billMap.get(fid).materials.push({
      code: row['FMaterialId.FNumber'] ?? '',
      name: row['FMaterialId.FName'] ?? '',
      qty: row['FInspectQty'] ?? '',
      unit: row['FUnitID.FNumber'] ?? '',
    });
  }
  return [...billMap.values()];
}

function formatDate(raw) {
  if (!raw) return '';
  return String(raw).split('T')[0];
}

function buildMarkdown(rows, bills) {
  const total = bills.length;
  const totalEntries = rows.length;

  const byType = {};
  const byStatus = {};
  for (const b of bills) {
    byType[b.typeName] = (byType[b.typeName] || 0) + 1;
    const statusLabel = STATUS_LABEL[b.status] || b.status;
    byStatus[statusLabel] = (byStatus[statusLabel] || 0) + 1;
  }

  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const lines = [];
  lines.push('# 金蝶 QM_InspectBill 检验单全量数据导出');
  lines.push('');
  lines.push(`**生成时间**: ${stamp}`);
  lines.push(`**数据范围**: 不限日期（全量）`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 一、统计概览');
  lines.push('');
  lines.push(`- 单据总数（按 FID 去重）：**${total}**`);
  lines.push(`- 物料分录总行数（BillQuery 按分录展开）：**${totalEntries}**`);
  lines.push('');
  lines.push('### 按单据类型统计');
  lines.push('');
  lines.push('| 单据类型 | 数量 |');
  lines.push('|---|---|');
  for (const [type, count] of Object.entries(byType)) {
    lines.push(`| ${type || '(未知)'} | ${count} |`);
  }
  lines.push('');
  lines.push('### 按单据状态统计');
  lines.push('');
  lines.push('| 状态 | 数量 |');
  lines.push('|---|---|');
  for (const [status, count] of Object.entries(byStatus)) {
    lines.push(`| ${status || '(未知)'} | ${count} |`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 二、检验单明细（按分录行展开）');
  lines.push('');
  lines.push('> 一张单据可能对应多个物料分录，此表按分录行展开，同一 FID/单据编号可能出现多行。');
  lines.push('');
  lines.push('| 序号 | FID | 单据编号 | 日期 | 单据类型 | 状态 | 物料编码 | 物料名称 | 检验数量 | 单位 |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|');

  let idx = 1;
  for (const b of bills) {
    const statusLabel = STATUS_LABEL[b.status] || b.status;
    for (const m of b.materials) {
      lines.push(
        `| ${idx} | ${b.fid} | ${b.billNo} | ${formatDate(b.date)} | ${b.typeName} | ${statusLabel} | ${m.code} | ${m.name} | ${m.qty} | ${m.unit} |`
      );
      idx += 1;
    }
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 三、一单多物料清单');
  lines.push('');
  const multi = bills.filter((b) => b.materials.length > 1);
  if (multi.length === 0) {
    lines.push('（无，所有单据均为单一物料）');
  } else {
    lines.push('| FID | 单据编号 | 物料种数 | 物料名称列表 |');
    lines.push('|---|---|---|---|');
    for (const b of multi) {
      lines.push(`| ${b.fid} | ${b.billNo} | ${b.materials.length} | ${b.materials.map((m) => m.name).join('、')} |`);
    }
  }
  lines.push('');

  return lines.join('\n');
}

async function main() {
  console.log('正在登录金蝶云星空...');
  const cookie = await login();
  console.log('登录成功，开始查询 QM_InspectBill...');

  const rows = await queryAll(cookie);
  console.log(`查询完成，共 ${rows.length} 行分录数据`);

  const bills = aggregateByBill(rows);
  console.log(`聚合后共 ${bills.length} 张单据`);

  const markdown = buildMarkdown(rows, bills);
  const outPath = path.resolve(__dirname, '../../../Programlogs/金蝶检验单全量数据导出.md');
  fs.writeFileSync(outPath, markdown, 'utf8');
  console.log(`已写入：${outPath}`);
}

main().catch((err) => {
  console.error('导出失败：', err.message || err);
  process.exit(1);
});
