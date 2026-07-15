# 金蝶云星空 HTTPS 连接排错经验日志

> 记录时间：2026-06-18
> 记录人：Claude Code
> 项目：QualifyInspection（React Native 0.81.5 + Expo SDK 54）
> 问题：手机真机连接金蝶服务器时提示 `Network request failed`，但测试软件可正常 POST

---

## 一、问题现象

- **App 端**：安装 APK 后打开，登录页自动调用 `loginBySign()`，弹出错误 **"Network request failed"**
- **测试端**：使用 HTTP 调试工具（如 Postman）向 `https://121.37.216.69/K3Cloud/...` 发送同样的 `POST` 请求，**可以正常返回**
- **浏览器端**：直接访问 `https://121.37.216.69` 可以打开，但显示"不安全"警告

---

## 二、排查过程

### 2.1 排除请求格式问题（初步假设）

首先对照《金蝶云星空WebAPI接口说明书_V6.0.md》检查请求格式：

| 检查项 | 文档要求 | 当时代码 | 结论 |
|--------|----------|----------|------|
| `Content-Type` | `application/json;charset=UTF-8` | `application/json` | **不规范，需修复** |
| `LoginBySign` 请求体 | 文档示例为对象字段格式 `{"acctID":"...",...}` | 使用用户验证过的 `{"parameters":[...]}` 数组格式 | 服务器支持两种格式，不是主因 |
| `BillQuery` 参数 | 实测要求请求体为对象 `{ data: {...} }` | 代码误用数组包字符串 `["{...}"]` | **不符合实测，需修复** |

> 虽然格式有差异，但 "Network request failed" 是**底层网络连接错误**，不是服务器返回的 HTTP 200 + 格式错误。因此判断主因不在请求格式。

### 2.2 分析 HTTPS 证书（找到根因）

使用 `openssl` 抓取服务器证书：

```bash
openssl s_client -connect 121.37.216.69:443 -servername 121.37.216.69 </dev/null 2>/dev/null | openssl x509 -text -noout
```

**关键发现**：

```
Subject: CN = *.gzsoundbox.com
Issuer:  C = CN, O = WoTrus CA Limited, CN = WoTrus DV Server CA
Not Before: Nov 12 00:00:00 2025 GMT
Not After : Nov 12 23:59:59 2026 GMT
Subject Alternative Name:
    DNS:*.gzsoundbox.com, DNS:gzsoundbox.com
```

- 证书是 **有效** 的（未过期）
- 但证书的 **Common Name (CN)** 和 **Subject Alternative Name (SAN)** 都是 `*.gzsoundbox.com`
- **App 使用的是 IP 地址 `121.37.216.69` 访问 HTTPS**

**根因确认**：

React Native Android 端使用 OkHttp 作为 HTTP 客户端。OkHttp 默认启用 **Hostname Verification**，会校验证书中的域名/SAN 是否与请求的目标地址匹配。

当通过 **IP 地址** 访问一个证书颁发给 **域名** 的服务器时，OkHttp 发现 hostname 不匹配，直接抛出 `SSLPeerUnverifiedException`，React Native 将其封装为 `Network request failed`。

> 测试软件（如 Postman）通常默认 **关闭 SSL Certificate Verification**，因此不受 hostname mismatch 影响，可以正常 POST。

---

## 三、修复方案

### 3.1 核心修复：绕过 Hostname Verification（保留证书链校验）

在 `android/app/src/main/java/.../MainApplication.kt` 中注入自定义 `OkHttpClientFactory`：

```kotlin
import com.facebook.react.modules.network.OkHttpClientFactory
import com.facebook.react.modules.network.OkHttpClientProvider
import okhttp3.OkHttpClient

class MainApplication : Application(), ReactApplication {
    override fun onCreate() {
        super.onCreate()

        // 金蝶服务器证书颁发给 *.gzsoundbox.com，但 App 通过 IP 121.37.216.69 访问。
        // 仅绕过 hostname 校验，保留完整的证书链校验，防止中间人攻击。
        try {
            OkHttpClientProvider.setOkHttpClientFactory(object : OkHttpClientFactory {
                override fun createNewNetworkModuleClient(): OkHttpClient {
                    return OkHttpClientProvider.createClientBuilder()
                        .hostnameVerifier { _, _ -> true }
                        .build()
                }
            })
        } catch (e: Exception) {
            Log.w("MainApplication", "OkHttp hostname verifier setup failed", e)
        }

        // ... 后续 RN 初始化代码
    }
}
```

**设计要点**：
- 只修改 `hostnameVerifier`，**不修改 `sslSocketFactory`**
- 保留证书链校验，确保证书必须由受信任的 CA（如 WoTrus）签发
- 使用 `OkHttpClientProvider.createClientBuilder()` 基于默认配置扩展，避免与 New Architecture 冲突

### 3.2 请求格式规范化（同步修复）

#### 1) Content-Type 统一加 charset

```kotlin
// 之前
headers: Record<string, string> = {
  'Content-Type': 'application/json',
}

// 之后
headers: Record<string, string> = {
  'Content-Type': 'application/json;charset=UTF-8',
}
```

#### 2) 单参数接口序列化修正

根据文档，部分单参数接口的参数格式为：
```json
["{\"FormId\":\"PUR_PurchaseOrder\",...}"]
```

即数组元素是 **JSON 字符串**，不是对象。

修复 `callKingdeeSingle`：

```typescript
export async function callKingdeeSingle<T>(
  service: KingdeeServiceName,
  data: unknown
): Promise<T> {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  return callKingdee<T>(service, [payload]);
}
```

---

## 四、验证结果

构建 `QualifyInspection-v1.0.11.apk` 后，在手机上测试：

- ✅ 打开 App 后自动显示"正在连接金蝶服务器…"
- ✅ **无输入框**（已移除手动登录）
- ✅ 连接成功后自动跳转首页
- ✅ 可正常拉取检验单列表（`BillQuery`）
- ✅ 可查看检验单详情（`View`）

---

## 五、经验总结

1. **"Network request failed" ≠ 服务器拒绝**
   - 如果测试工具可以 POST 但 App 不行，优先排查 **SSL/TLS 层**（证书、hostname、TLS 版本）
   - 使用 `openssl s_client -connect host:443` 可以迅速获取证书信息

2. **IP 访问 HTTPS 的隐患**
   - 内网/测试环境常通过 IP 直接访问服务器，但如果服务器证书是颁发给域名的，移动端 HTTP 客户端（OkHttp/NSURLSession）默认会拒绝
   - 测试工具（Postman、浏览器插件）常默认关闭 SSL 验证，会掩盖这个问题

3. **最小侵入原则**
   - 之前尝试 `sslSocketFactory` + `hostnameVerifier` 双 bypass，在 RN 0.81 New Architecture 下导致崩溃
   - 改为 **只绕过 hostname verification**，保留证书链校验，既解决连接问题，又避免与 New Architecture 冲突

4. **严格对照文档**
   - `Content-Type` 中的 `charset=UTF-8`、参数序列化方式等细节，虽然不一定是本次主因，但规范化后可以减少后续踩坑

---

## 六、相关文件

| 文件 | 修改内容 |
|------|----------|
| `android/app/src/main/java/.../MainApplication.kt` | 注入 `OkHttpClientFactory`，设置 `hostnameVerifier { _, _ -> true }` |
| `api/kingdee/client.ts` | `KINGDEE_BASE_URL` 保持 `https://121.37.216.69`；`Content-Type` 改为 `application/json;charset=UTF-8`；修复 `callKingdeeSingle` 序列化 |
| `api/kingdee/auth.ts` | `Content-Type` 改为 `application/json;charset=UTF-8` |
| `network_security_config.xml` | 保留 `cleartextTrafficPermitted="true"` 和 `certificates src="user"` 配置（作为兜底） |

---

## 七、BillQuery 查询接口排错经验

> 记录时间：2026-06-24
> 记录人：Claude Code
> 背景：HTTPS 连接修复后，检验单列表页面仍报"查询检验单失败：返回格式异常（未找到数据数组）"

### 7.1 问题现象

- **App 端**：登录成功（Cookie 已建立），但进入"检验单管理"后弹出 **"查询检验单失败：返回格式异常（未找到数据数组）"**
- **测试端**：使用 HTTP 调试工具向 `https://121.37.216.69/K3Cloud/Kingdee.BOS.WebApi.ServicesStub.DynamicFormService.BillQuery.common.kdsvc` 发送同样的请求，**可以正常返回对象数组**
- **关键点**：测试端能通，但 App 端反复报错，说明请求格式或返回解析存在差异

### 7.2 排查过程

#### 7.2.1 请求体格式差异（第一个坑）

最初代码按照文档描述，使用 `callKingdee('BillQuery', [JSON.stringify(queryParam)])`，请求体为：
```json
["{\"FormId\":\"QM_InspectBill\",...}"]
```
即 **数组中包含 JSON 字符串**。

但实测发现，金蝶 `BillQuery` 接口实际接受的格式是 **直接的对象**：
```json
{
    "data": {
        "FormId": "QM_InspectBill",
        "FieldKeys": "FID,FBILLNO,FDate,FBILLTYPEID.FNumber,FDocumentStatus",
        "FilterString": " FDate >='2026-03-26' and FDate <= '2026-06-24' ",
        "OrderString": " FDate DESC ",
        "StartRow": 0,
        "Limit": 50
    }
}
```

**结论**：`BillQuery` 的入参不是数组包字符串，而是 `{ data: {...} }` 对象。文档中的示例格式与实际运行环境存在差异，必须以**实测抓包为准**。

#### 7.2.2 返回值格式差异（第二个坑）

最初代码假设 `BillQuery` 返回的是**二维数组**：
```json
[[100051, "IQC000010", "2026-06-23T00:00:00", "JYD001_SYS", "A"], ...]
```

但实测返回的是**对象数组**：
```json
[
  {
    "FID": 100051,
    "FBILLNO": "IQC000010",
    "FDate": "2026-06-23T00:00:00",
    "FBILLTYPEID.FNumber": "JYD001_SYS",
    "FDocumentStatus": "A"
  },
  ...
]
```

**关键细节**：
- 对象键名就是 `FieldKeys` 中定义的字段标识（包括带点号的 `"FBILLTYPEID.FNumber"`）
- 必须用 `record['FBILLTYPEID.FNumber']` 取值，不能用 `record.FBILLTYPEID.FNumber`（虽然 JS 支持，但一致性更好）

#### 7.2.3 多余字段导致异常（第三个坑）

代码中最初传了 `TopRowCount: 0` 和 `SubSystemId: ''`，但实测抓包中**没有这两个字段**。虽然金蝶通常应该忽略未知字段，但在某些版本/补丁下，多余字段可能导致服务端内部异常或返回空结果。

**修复**：只保留实测必需的字段：
```typescript
const requestBody = {
  data: {
    FormId: FORM_ID,
    FieldKeys: LIST_FIELD_KEYS,
    FilterString: filterString,
    OrderString: ' FDate DESC ',
    StartRow: 0,
    Limit: 50,
  },
};
```

#### 7.2.4 嵌套错误检测（MsgCode 与会话丢失）

金蝶的错误响应可能以多种嵌套方式返回：
- `{ MsgCode: 1 }`
- `{ ResponseStatus: { MsgCode: 1 } }`
- `{ Result: { ResponseStatus: { MsgCode: 1 } } }`

如果只在顶层检查 `MsgCode`，当错误被嵌套在 `Result.ResponseStatus` 内部时，**会话丢失不会被识别**，导致后续请求继续携带无效 Cookie，最终返回格式异常或空数据。

**修复**：在 `client.ts` 的 `executeRequest` 中实现三层嵌套检测：
```typescript
if ('MsgCode' in b) { ... }
else if ('ResponseStatus' in b && 'MsgCode' in b.ResponseStatus) { ... }
else if ('Result' in b && 'ResponseStatus' in b.Result && 'MsgCode' in b.Result.ResponseStatus) { ... }
```

### 7.3 调试策略：内置 Debug-Response 页面

由于真机环境无法像浏览器一样直接打开 DevTools 查看网络响应，采用以下策略：

1. **在 `api/kingdee/inspect.ts` 中分阶段保存调试信息**：
   - `callKingdeePost` 请求失败：保存 `requestBody` + 错误消息
   - `normalizeRows` 解析失败：保存 `requestBody` + `rawResult` + 错误消息

2. **在 `screens/order-list/index.tsx` 中，所有非 SESSION_LOST 错误统一跳转**：
   ```typescript
   if (message === 'SESSION_LOST') { /* 显示登录横幅 */ }
   else { router.push('/debug-response'); }
   ```

3. **`debug-response` 页面展示**：
   - 请求参数（`requestBody`）
   - 原始响应（`rawResult`）
   - 错误阶段（`stage: 'request' | 'normalizeRows'`）
   - 时间戳

**效果**：用户安装 APK 后，一旦报错即自动跳转到调试页面，可以截图完整的请求/响应 JSON，开发者根据截图即可精确定位问题，无需复现。

### 7.4 修复后的代码结构

```typescript
// api/kingdee/client.ts
export async function callKingdeePost<T>(
  service: KingdeeServiceName,
  body: unknown
): Promise<T> {
  // 直接发送 JSON.stringify(body)，不包装成数组
}

// api/kingdee/inspect.ts
const requestBody = {
  data: {
    FormId: 'QM_InspectBill',
    FieldKeys: 'FID,FBILLNO,FDate,FBILLTYPEID.FNumber,FDocumentStatus',
    FilterString: " FDate >='2026-03-26' and FDate <= '2026-06-24' ",
    OrderString: ' FDate DESC ',
    StartRow: 0,
    Limit: 50,
  },
};
const result = await callKingdeePost<unknown>('BillQuery', requestBody);

function normalizeRows(raw: unknown): unknown[] {
  // 兼容：对象数组 / 二维数组 / { Result: [...] } / { data: [...] } 等
}
```

### 7.5 相关文件

| 文件 | 修改内容 |
|------|----------|
| `api/kingdee/client.ts` | 新增 `callKingdeePost`（直接发送对象 body）；提取共享 `executeRequest` 处理 Cookie/超时/MsgCode |
| `api/kingdee/inspect.ts` | `queryInspectBills` 改用 `callKingdeePost`；入参改为 `{ data: {...} }`；新增 `normalizeRows` 适配对象数组返回 |
| `screens/order-list/index.tsx` | 所有非 SESSION_LOST 查询错误统一跳转 `/debug-response` |
| `screens/debug-response/index.tsx` | 新建调试页面，展示请求体、原始响应、错误信息 |
| `app/debug-response.tsx` + `app/_layout.tsx` | 注册调试路由 |

### 7.6 经验总结

1. **文档仅供参考，实测为准**
   - 金蝶文档描述查询接口返回 `List<List<object>>`，但实测 `BillQuery` 返回的是 `List<object>`（对象数组）
   - 文档描述参数为数组包字符串，但实测为 `{ data: {...} }` 对象
   - 必须以**真机/调试工具抓包**的实际格式为准，不能只看文档

2. **对象数组 vs 二维数组**
   - 对象数组的键名就是 `FieldKeys` 中的字段标识（含点号），如 `"FBILLTYPEID.FNumber"`
   - 解析时用 `record[fieldName]` 取值，然后统一转换为二维数组供下游使用，可减少后续代码改动

3. **参数宁少勿多**
   - 接口未明确要求的字段（如 `TopRowCount`、`SubSystemId`）尽量不传，避免服务端版本差异导致异常
   - 字符串字段（如 `FilterString`、`OrderString`）中的空格、引号尽量与实测成功样例保持一致

4. **真机调试必须可视化**
   - RN 真机无法直接查看网络请求，内置 debug-response 页面是最高效的远程排错手段
   - 分阶段保存（请求阶段 / 解析阶段），可以快速定位问题发生在网络层还是应用层

5. **基础资料字段键名全大写**
   - 金蝶系统中基础资料字段如 `{ FNUMBER: "编码" }` 要求键名全大写 `FNUMBER`，不是 `FNumber`
   - 此细节在 `updateInspectValues` 回传检验值时尤为重要
