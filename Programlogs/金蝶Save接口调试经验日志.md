# 金蝶Save接口（QM_InspectBill）调试经验日志

> 记录日期：2026-07-07  
> 涉及版本：v1.2.8 → v1.3.0  
> 核心模块：`api/kingdee/inspect.ts`、`screens/order-detail/index.tsx`

---

## 一、问题背景

目标：实现检验结果保存功能，将前端录入的**检验项目(FItemDetail)**、**缺陷记录(FDefectDetail)**、**使用决策(FPolicyDetail)** 数据通过金蝶云Save接口持久化到 `QM_InspectBill`（检验单）。

核心难点：金蝶Save接口对子单据体的处理逻辑与常规REST API差异较大，尤其是明细行的**新增 vs 修改**区分、字段精简策略、以及View接口与Save接口的字段映射。

---

## 二、核心问题与解决方案

### 2.1 FDetailID — 新增传0，修改传已有ID

**问题现象**：
- 所有子单据体行在保存时 `FDetailID` 都传了 `"0"`，导致金蝶将已有行视为新增行，出现**重复数据**（如检验项目保存后数量翻倍）。

**根本原因**：
- 金蝶要求：**新增行传 `"0"`，修改已有行必须传该行在数据库中的真实 `FDetailID`**。
- 程序通过 View 接口获取已有数据时，未正确提取各子单据体的 `FDetailID`。

**关键发现 — 字段名不一致**：
View接口返回数据中，不同子单据体的明细ID字段名不同：

| 子单据体 | View接口返回的字段名 |
|---------|-------------------|
| FItemDetail（检验项目） | `Id` 或 `FDetailID` |
| FDefectDetail（缺陷记录） | `Id`、`FDetailID`、`DetailID` 都有可能 |
| FPolicyDetail（使用决策）| `FDetailID`、`DetailID`、`Id` 都有可能 |

**解决方案**：
在 `convertBillToLocal` 中统一使用候选字段名查找：
```typescript
const detailIdKey = findFieldInObj(record, ['FDetailID', 'DetailID', 'Id']);
const detailId = detailIdKey != null ? String(record[detailIdKey] || '0') : '0';
```

**程序内状态管理**：
- 类型定义扩展：`DecisionInfo`、`LocalDecision`、`LocalInspectionItem`、`LocalDefectRecord` 均增加 `detail_id?: string`
- 新增行时 `detail_id` 为 `undefined`（提交时转为 `'0'`）
- 已有行时 `detail_id` 为 View 接口获取的真实ID

---

### 2.2 Save请求字段精简 — 只传可编辑字段

**问题现象**：
- 早期Save请求包含了大量系统生成的只读字段（如 `FMaterialID`、`FUnitID`、`FInspectQty`、`FDSerialId`、`FBaseDefectQty1` 等），导致请求体过大且可能触发金蝶校验错误。

**解决策略**：
根据金蝶OpenAPI文档和 `model-sample.txt`，**Save请求只包含用户可编辑的字段 + 必要的系统字段（FID、FEntryID、FDetailID、IsDeleteEntry）**。

#### FItemDetail（检验项目）保留字段：
| 字段 | 说明 |
|-----|------|
| `FDetailID` | 明细内码（新增0，修改传已有ID） |
| `FInspectItemId` | 检验项目编码，格式 `{FNUMBER: "code"}` |
| `FInspectResult1` | 检验结果编码：**"1"=合格，"2"=不合格** |
| `FInspectValQ` | 合格数量（合格时≥1，不合格时=0） |
| `FInspectValB` | 定性分析的检测值 |
| `FInspectValT` | 其他分析的检测值 |

#### FDefectDetail（缺陷记录）保留字段：
| 字段 | 说明 |
|-----|------|
| `FDetailID` | 明细内码 |
| `FDefectTypeId` | 缺陷类型编码，格式 `{FNUMBER: "code"}` |
| `FDefectQty` | 缺陷数量 |
| `FDefectReasonId` | 缺陷原因编码，格式 `{FNUMBER: "code"}` |
| `FDefectLevel` | 缺陷等级编码：**"1"=致命，"2"=重缺陷，"3"=轻缺陷** |
| `FDefectResultId` | 缺陷后果编码，格式 `{FNUMBER: "code"}` |

#### FPolicyDetail（使用决策）保留字段：
| 字段 | 说明 |
|-----|------|
| `FDetailID` | 明细内码 |
| `FPolicyStatus` | 状态编码：**"1"=合格，"2"=不合格** |
| `FPolicyQty` | 决策数量 |
| `FUsePolicy` | 使用决策编码：**"A"=接收，"C"=返修，"D"=报废，"F"=判退，"G"=不良** |
| `FIsDefectProcess` | 不良处理，字符串 **"true"/"false"** |
| `FIsMRBReview` | MRB评审，字符串 **"true"/"false"** |

---

### 2.3 IsDeleteEntry 参数 — 必须传 "false"

**问题现象**：
- 未传 `IsDeleteEntry` 时，金蝶默认将其视为 `"true"`，导致保存时**删除所有现有子单据体**，再插入传入的数据。
- 这会导致虽然数据看起来正确，但实际上是"删了重建"，可能触发业务流程问题（如序列号丢失、关联数据断裂）。

**解决方案**：
```typescript
IsDeleteEntry: "false"  // 保留现有子单据体，只修改/新增传入的行
```

> ⚠️ 注意：所有布尔参数在金蝶Save接口中**必须传字符串 `"true"` / `"false"`**，不能传布尔值 `true` / `false`。

---

### 2.4 FEntity_Link 的处理

**问题现象**：
- 早期尝试在Save请求中构造 `FEntity_Link` 子数组，导致格式错误。

**关键发现**：
- `FEntity_Link` 字段在Save请求中是**平铺字段**（如 `FEntity_Link_FFlowId`、`FEntity_Link_FFlowLineId`），直接放在 `FEntity` 条目上即可，**不需要嵌套数组**。
- 但当前版本（v1.3.0）的精简策略下，暂不主动构造 `FEntity_Link`，由金蝶系统根据单据头自动关联。

---

### 2.5 基础资料字段格式

金蝶Save接口中，所有基础资料类型字段（如 `FInspectItemId`、`FDefectTypeId`）必须传对象格式：
```typescript
{ FNUMBER: "编码值" }
```
不能传字符串或直接传ID。

---

### 2.6 保存后自动刷新

**问题现象**：
- 保存成功后界面仍显示旧数据，用户需要手动返回再进入才能看到最新状态。

**解决方案**：
保存成功后立即调用 `fetchDetail()` 重新拉取View接口数据：
```typescript
if (result.success) {
  showSuccess('检验结果已保存');
  fetchDetail(); // 自动刷新界面
}
```

---

## 三、版本演进记录

| 版本 | 修改内容 |
|-----|---------|
| v1.2.8~v1.2.28 | 早期试错阶段，反复调整字段和格式 |
| v1.2.29 | 新增 `detail_id` 支持（决策行）；Save请求字段精简为仅可编辑字段 |
| v1.2.30 | 修复检验项目 `FDetailID` 提取（View接口字段名为 `Id`）；新增保存后自动刷新 |
| **v1.3.0** | 删除"提交单据"按钮及相关功能；保留诊断面板供后续开发使用 |

---

## 四、关键文件与代码位置

| 文件 | 关键逻辑 |
|-----|---------|
| `api/kingdee/inspect.ts` | `submitInspectionResult()` — Save请求构造；`convertBillToLocal()` — View数据解析 |
| `api/kingdee/types.ts` | `DecisionInfo` 类型定义 |
| `screens/order-detail/index.tsx` | `LocalDecision` 类型；`handleSubmit()` 保存逻辑；`fetchDetail()` 刷新逻辑 |

---

## 五、调试技巧

1. **诊断面板**：保存时记录完整的请求体和响应体，通过弹窗查看，是定位字段问题的核心手段。
2. **字段名映射**：View接口返回的字段名可能与Save接口要求的字段名不同（如 `Id` vs `FDetailID`），需建立候选查找机制。
3. **最小请求验证**：当请求失败时，先构造仅含 `FID`、`FEntryID`、`IsDeleteEntry` 和一条最小子单据体的请求，逐步添加字段定位问题源。
4. **版本号管理**：每轮调试后升级版本号，确保测试端安装的是最新APK。

---

## 六、后续待办

- [ ] 持续观察Save接口在真实业务场景下的稳定性
- [ ] 如金蝶系统升级，需重新核对 `model-sample.txt` 中的字段清单
- [ ] 诊断面板后续可改为仅在Debug模式下显示
