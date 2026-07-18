/**
 * 导出金蝶 QM_QCScheme（质检方案）数据为 Markdown
 *
 * 质检方案在金蝶通讯中以编码（FNumber）传递，本脚本：
 * 1. 通过 BillQuery 查询 QM_QCScheme 的 FNumber/FName，生成编码 <-> 名称对照表
 * 2. 对每个编码调用 View 接口，导出该质检方案的全部字段内容（完整数据）
 *
 * 用法：
 *   node scripts/export-qcscheme-map.js
 *
 * 输出：
 *   ../../../Programlogs/金蝶质检方案编码映射表.md      （编码-名称对照表）
 *   ../../../Programlogs/金蝶质检方案完整字段导出.md    （每个编码的全部字段，View 接口）
 *
 * 登录方式与证书处理详见 export-all-inspectbills.js 头部注释：
 * - 登录后只使用 Set-Cookie 头解析出的原始 Cookie，避免被响应体 KDSVCSessionId 覆盖
 * - 服务器证书签发给 *.gzsoundbox.com，本脚本通过 IP 121.37.216.69 访问会触发
 *   hostname 不匹配，因此使用 rejectUnauthorized: false 仅绕过证书校验（本地一次性导出脚本，非生产代码）
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

const FORM_ID = 'QM_QCScheme';
const FIELD_KEYS = ['FNumber', 'FName'].join(',');

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

/** 提取 View 接口返回的数据对象，逻辑对齐 inspect.ts 的 extractViewResult */
function extractViewResult(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('View 返回格式异常');
  }
  const rs = raw.ResponseStatus;
  if (rs) {
    if (rs.IsSuccess === false || rs.IsSuccess === 'false') {
      const firstMsg = rs.Errors?.[0]?.Message;
      if (firstMsg) throw new Error(firstMsg);
    }
    if (typeof rs.Message === 'string' && rs.Message) {
      throw new Error(rs.Message);
    }
  }

  let data;
  if ('Result' in raw && raw.Result && typeof raw.Result === 'object') {
    data = 'Result' in raw.Result ? raw.Result.Result : raw.Result;
  } else {
    data = raw;
  }

  if (data === null || data === undefined) {
    throw new Error('View 返回数据为空');
  }
  return data;
}

/** 调用 View 接口，查询单个质检方案编码的全部字段 */
async function viewQCScheme(cookie, number) {
  const requestBody = {
    formid: FORM_ID,
    data: {
      CreateOrgId: 0,
      Number: number,
      Id: '',
      IsSortBySeq: 'false',
    },
  };

  const res = await postJson(
    '/K3Cloud/Kingdee.BOS.WebApi.ServicesStub.DynamicFormService.View.common.kdsvc',
    requestBody,
    cookie
  );

  let parsed;
  try {
    parsed = JSON.parse(res.body);
  } catch {
    throw new Error(`View 返回非 JSON：${res.body.slice(0, 300)}`);
  }

  return extractViewResult(parsed);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


async function queryPage(cookie, startRow, limit) {
  const requestBody = {
    data: {
      FormId: FORM_ID,
      FieldKeys: FIELD_KEYS,
      FilterString: '',
      OrderString: 'FNumber',
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
    console.log(`  已拉取 ${all.length} 行（本页 ${rows.length} 行）`);
    if (rows.length < limit) break;
    startRow += limit;
  }
  return all;
}

function normalizeRows(rows) {
  const list = [];
  for (const row of rows) {
    let code;
    let name;
    if (Array.isArray(row)) {
      code = row[0];
      name = row[1];
    } else if (row && typeof row === 'object') {
      const rec = row;
      code = rec.FNumber ?? rec.FNUMBER ?? rec.fnumber;
      name = rec.FName ?? rec.FNAME ?? rec.fname;
    }
    code = code == null ? '' : String(code).trim();
    name = name == null ? '' : String(name).trim();
    if (code) list.push({ code, name });
  }
  return list;
}

function buildMarkdown(list) {
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const lines = [];
  lines.push('# 金蝶 QM_QCScheme（质检方案）编码-名称映射表');
  lines.push('');
  lines.push(`**生成时间**: ${stamp}`);
  lines.push(`**来源**: BillQuery 接口，FormId=QM_QCScheme，FieldKeys=FNumber,FName`);
  lines.push(`**说明**: 质检方案在金蝶通讯（BillQuery/View/Save 等接口）中以 FNumber 编码传递，`);
  lines.push('本表记录编码与实际文字内容（方案名称）的对照关系，供解析/展示时反查使用。');
  lines.push('');
  lines.push(`- 记录总数：**${list.length}**`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 编码-名称对照表');
  lines.push('');
  lines.push('| 序号 | 编码（FNumber） | 名称（FName） |');
  lines.push('|---|---|---|');
  list.forEach((item, idx) => {
    lines.push(`| ${idx + 1} | ${item.code} | ${item.name} |`);
  });
  lines.push('');

  return lines.join('\n');
}

/** 将任意嵌套对象/数组展平为 { 'a.b[0].c': value } 形式的键值对，便于统一渲染成表格 */
function flattenObject(obj, prefix = '') {
  const result = {};
  if (obj === null || obj === undefined) return result;
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v === null || v === undefined) {
      result[key] = '';
    } else if (Array.isArray(v)) {
      if (v.length === 0) {
        result[key] = '[]';
      } else {
        v.forEach((item, i) => {
          if (item && typeof item === 'object') {
            Object.assign(result, flattenObject(item, `${key}[${i}]`));
          } else {
            result[`${key}[${i}]`] = String(item);
          }
        });
      }
    } else if (typeof v === 'object') {
      Object.assign(result, flattenObject(v, key));
    } else {
      result[key] = String(v);
    }
  }
  return result;
}

function escapeMdCell(val) {
  return String(val).replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

function buildFullFieldsMarkdown(results) {
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const ok = results.filter((r) => !r.error);
  const failed = results.filter((r) => r.error);

  const lines = [];
  lines.push('# 金蝶 QM_QCScheme（质检方案）完整字段导出');
  lines.push('');
  lines.push(`**生成时间**: ${stamp}`);
  lines.push(`**来源**: View 接口，FormId=QM_QCScheme，逐编码查询（Number=FNumber）`);
  lines.push(`**说明**: 每个质检方案编码对应一节，列出 View 接口返回的全部字段（含嵌套/表体字段，已展平为 点号/下标 路径）。`);
  lines.push('');
  lines.push(`- 成功：**${ok.length}**  失败：**${failed.length}**  总计：**${results.length}**`);
  lines.push('');
  if (failed.length > 0) {
    lines.push('### 查询失败列表');
    lines.push('');
    lines.push('| 编码 | 名称 | 错误信息 |');
    lines.push('|---|---|---|');
    for (const r of failed) {
      lines.push(`| ${r.code} | ${r.name} | ${escapeMdCell(r.error)} |`);
    }
    lines.push('');
  }
  lines.push('---');
  lines.push('');

  ok.forEach((r, idx) => {
    lines.push(`## ${idx + 1}. ${r.code} — ${r.name}`);
    lines.push('');
    const flat = flattenObject(r.data);
    const keys = Object.keys(flat);
    if (keys.length === 0) {
      lines.push('（无字段数据）');
    } else {
      lines.push('| 字段路径 | 值 |');
      lines.push('|---|---|');
      for (const key of keys) {
        lines.push(`| ${escapeMdCell(key)} | ${escapeMdCell(flat[key])} |`);
      }
    }
    lines.push('');
  });

  return lines.join('\n');
}


async function main() {
  console.log('正在登录金蝶云星空...');
  const cookie = await login();
  console.log(`登录成功，开始查询 ${FORM_ID}...`);

  const rawRows = await queryAll(cookie);
  console.log(`查询完成，共 ${rawRows.length} 行原始数据`);

  const list = normalizeRows(rawRows);
  list.sort((a, b) => a.code.localeCompare(b.code));
  console.log(`整理后共 ${list.length} 条有效映射`);

  const markdown = buildMarkdown(list);
  const outPath = path.resolve(__dirname, '../../../Programlogs/金蝶质检方案编码映射表.md');
  fs.writeFileSync(outPath, markdown, 'utf8');
  console.log(`已写入：${outPath}`);

  console.log(`开始逐编码查询 View 接口获取完整字段（共 ${list.length} 条）...`);
  const results = [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    try {
      const data = await viewQCScheme(cookie, item.code);
      results.push({ code: item.code, name: item.name, data });
    } catch (err) {
      results.push({ code: item.code, name: item.name, error: err.message || String(err) });
    }
    if ((i + 1) % 10 === 0 || i === list.length - 1) {
      console.log(`  已查询 ${i + 1}/${list.length}`);
    }
    await sleep(80); // 避免请求过密
  }

  const fullMarkdown = buildFullFieldsMarkdown(results);
  const fullOutPath = path.resolve(__dirname, '../../../Programlogs/金蝶质检方案完整字段导出.md');
  fs.writeFileSync(fullOutPath, fullMarkdown, 'utf8');
  console.log(`已写入：${fullOutPath}`);
}

main().catch((err) => {
  console.error('导出失败：', err.message || err);
  process.exit(1);
});
