# 循环计划：完善保存表单功能与缺陷修复

## Context

当前检验单保存功能存在严重bug：点击"保存检验结果"后弹出 **"Cannot read property 'Result' of null"**。这是因为将接口从 `Save` 切换为 `SaveData` 后，响应处理逻辑未做适配，且保存数据结构存在多处与 View 接口返回结构不匹配的问题。

本计划采用**循环迭代**方式，每轮修复最阻塞的问题并构建测试，逐步完善保存功能的稳定性和数据准确性。

---

## 第1轮：修复空值崩溃（阻塞性bug）

**目标**：消除 "Cannot read property 'Result' of null" 错误，使保存流程能正常走完。

### 修改文件
| 文件 | 修改内容 |
|------|---------|
| `api/kingdee/inspect.ts` → `saveInspectBill` | 在解析响应前添加 `if (!result) throw new Error(...)` 空值保护 |
| `api/kingdee/client.ts` → `executeRequest` | 在 `return body as T` 前添加 `if (body === null) throw new Error('金蝶接口返回为空')` |
| `api/kingdee/inspect.ts` → `saveInspectBill` | 根据 `SaveData` 实际返回结构（直接 `{ ResponseStatus }` 而非嵌套 `Result.ResponseStatus`）调整响应解析逻辑 |

### 验证方式
1. 构建 APK v1.2.2
2. 进入检验单详情页
3. 修改任意检验项目检测值
4. 点击"保存检验结果"
5. **预期**：不再出现 `Result of null` 错误，提示"检验结果已保存"或显示金蝶返回的具体业务错误

---

## 第2轮：修复保存数据结构（与View结构对齐）

**目标**：确保保存时的数据结构与 View 接口返回的结构一致，使数据能被金蝶正确接收并持久化。

### 问题清单

#### 2.1 使用决策子单据体结构错误
- **读取时**：`convertBillToLocal` 从 `entry.FPolicyDetail`（子单据体数组）读取
- **保存时**：`submitInspectionResult` 直接设置到 `FEntity[].FPolicyStatus` 等字段
- **修复**：保存时应构建 `FPolicyDetail` 数组放入 `FEntity[0].FPolicyDetail`，与读取结构一致

#### 2.2 缺陷记录明细 ID 字段不一致
- **读取时**：`convertBillToLocal` 读取 `Id` / `FDetailID` / `DetailID`
- **保存时**：`submitInspectionResult` 使用 `Id`
- **修复**：统一使用 `FDetailID`（与金蝶类型定义一致），新建传 `'0'`

#### 2.3 整单结论字段缺失
- **现状**：`submitInspectionResult` 接收 `billResult` 和 `inspector` 参数但未设置到 `bill`
- **修复**：在 `bill` 对象上设置 `FBILLRESULT`、`FINSPECTOR`、`FINSPECTTIME`

#### 2.4 检验项目 `analysis_method` 丢失
- **现状**：`handleSubmit` 组装 `mappedItems` 时未传递 `analysis_method`
- **修复**：补充传递 `analysis_method` 和 `result` 字段

### 修改文件
| 文件 | 修改内容 |
|------|---------|
| `screens/order-detail/index.tsx` → `handleSubmit` | `mappedItems` 补充 `analysis_method` 和 `result` |
| `api/kingdee/inspect.ts` → `submitInspectionResult` | 设置 `FBILLRESULT`、`FINSPECTOR`、`FINSPECTTIME`；使用决策改为 `FPolicyDetail` 子单据体；缺陷 `Id` 改为 `FDetailID` |
| `api/kingdee/types.ts` | 在 `InspectBillEntry` 中添加 `FPolicyDetail?: PolicyDetail[]` 和 `FDefectDetail?: DefectDetail[]` |

### 验证方式
1. 构建 APK v1.2.3
2. 添加一条缺陷记录（类型/原因/后果填写中文）
3. 修改使用决策
4. 录入检验项目检测值
5. 保存后返回列表，重新进入该单据
6. **预期**：所有修改的数据（检验值、缺陷、决策）均能正确回显

---

## 第3轮：完善字段映射与错误处理

**目标**：处理基础资料字段格式、增强错误提示、添加保存诊断能力。

### 问题清单

#### 3.1 基础资料字段格式确认
- **现状**：缺陷类型/原因/后果使用 `{ FNumber: 编码 }` 传递
- **疑问**：金蝶 `SaveData` 接口是否支持 `{ FName: 中文名称 }` 按名称匹配？
- **修复**：根据金蝶实际响应调整，优先尝试 `FName`，若失败保持 `FNumber`

#### 3.2 错误提示不友好
- **现状**：金蝶返回的字段级错误信息未展示给用户
- **修复**：解析 `ResponseStatus.Errors` 中的 `FieldName` 和 `Message`，拼接成可读错误提示

#### 3.3 添加保存诊断面板（可选，调试用）
- 在 UI 上展示最近一次保存请求/响应的原始 JSON，方便排查字段映射问题

### 修改文件
| 文件 | 修改内容 |
|------|---------|
| `api/kingdee/inspect.ts` → `saveInspectBill` | 增强错误信息解析，将 `FieldName: Message` 格式展示给用户 |
| `api/kingdee/inspect.ts` → `submitInspectionResult` | 缺陷基础资料字段支持 `FName` 回退 |
| `screens/order-detail/index.tsx` | 可选：添加保存请求/响应诊断面板 |

### 验证方式
1. 构建 APK v1.2.4
2. 故意输入错误数据（如不存在的缺陷类型）
3. **预期**：看到友好的中文错误提示，如 "缺陷类型不存在：FDefectTypeId 字段校验失败"

---

## 第4轮：回归测试与性能优化

**目标**：确保保存功能在各种场景下稳定工作。

### 测试场景
1. **新建缺陷**：添加全新缺陷记录，保存后重进确认持久化
2. **修改缺陷**：编辑已有缺陷，保存后确认更新
3. **删除缺陷**：删除缺陷后保存，确认金蝶端同步删除
4. **仅修改检验值**：不碰缺陷和决策，只改检测值，保存确认
5. **仅修改决策**：不碰检验值和缺陷，只改使用决策，保存确认
6. **空数据保存**：没有任何可编辑数据时点击保存，应有友好提示
7. **网络异常**：断网时保存，应有缓存或重试提示

### 修改文件
| 文件 | 修改内容 |
|------|---------|
| `screens/order-detail/index.tsx` | 空数据校验：没有任何修改时禁用保存或提示"暂无修改" |
| `api/kingdee/inspect.ts` | 离线缓存策略：保存失败时将数据写入 AsyncStorage 待同步 |

---

## Critical Files

| 文件 | 职责 |
|------|------|
| `api/kingdee/inspect.ts` | 核心：SaveData 接口调用、响应解析、数据组装 |
| `api/kingdee/client.ts` | HTTP 客户端：空响应处理、Cookie 管理 |
| `api/kingdee/types.ts` | 类型定义：确保保存结构与 View 结构一致 |
| `screens/order-detail/index.tsx` | UI 层：数据组装、用户交互、错误展示 |

## 版本规划

| 轮次 | 版本 | 核心目标 |
|------|------|---------|
| 第1轮 | v1.2.2 | 修复 `Result of null` 崩溃 |
| 第2轮 | v1.2.3 | 修复数据结构不匹配 |
| 第3轮 | v1.2.4 | 完善字段映射与错误提示 |
| 第4轮 | v1.2.5 | 回归测试与性能优化 |

## 备注

- 每轮修改后必须运行 `npm run typecheck` 和 `node scripts/build-local.js`
- 每轮构建的 APK 需安装到小米平板7上进行真机测试
- 若某轮测试发现问题，记录后纳入下一轮修复，形成循环迭代
