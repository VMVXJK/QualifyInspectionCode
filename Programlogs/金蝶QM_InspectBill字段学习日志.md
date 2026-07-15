# 金蝶 QM_InspectBill 字段学习日志（OpenAPI 网站）

**学习时间**: 2026-07-14
**学习方式**: 通过 Playwright 打开金蝶云星空 OpenAPI 网站 (https://openapi.open.kingdee.com)，在用户协助下查看 QM_InspectBill 的字段定义页面。

---

## 一、ExecuteBillQuery（单据查询）分录字段语法

根据 API 文档页注释：
> 查询单据体内码，需加单据体 Key 和下划线，如：`FEntryKey_FEntryId`

这意味着 BillQuery 的 `FieldKeys` 中可以使用以下格式取分录字段：
- `FEntity_FMaterialId.FNumber` —— 分录物料编码
- `FEntity_FMaterialId.FName` —— 分录物料名称
- `FEntity_FUnitID.FNumber` —— 分录单位

**注意**：实际测试时需确认服务器是否支持此语法。

---

## 二、单据头（主表）关键字段

| 名称 | 标识 | 说明 |
|------|------|------|
| 来源组织 | `FSourceOrgId` | 基础资料对象 |
| 质检组织 | `FInspectOrgId` | 基础资料对象 |
| 质检员 | `FInspectorId` | 基础资料对象 |
| 单据类型 | `FBillTypeID` | 基础资料对象，编码为 `.FNumber`，名称为 `.FName` |
| 单据状态 | `FDocumentStatus` | 字符串，Z=创建, A=审核中, B=已审核, C=重新审核 |
| 单据日期 | `FDate` | 日期字符串 |

---

## 三、主表体（FEntity）关键字段

| 名称 | 标识 | 是否必填 | 说明 |
|------|------|---------|------|
| 物料编码 | `FMaterialId` | true | 基础资料对象，编码 `.FNumber` |
| 物料名称 | `FMaterialName` | — | 字符串（关联携带） |
| 规格型号 | `FMaterialModel` | — | 字符串 |
| 单位 | `FUnitID` | — | 基础资料对象 |
| 质检方案 | `FQCSchemeId` | — | 基础资料对象 |
| 检验数量 | `FInspectQty` | — | 数值 |
| 合格数 | `FQualifiedQty` | — | 数值 |
| 不合格数 | `FUnqualifiedQty` | — | 数值 |
| 检验结果 | `FInspectResult` | — | 默认值为 `1` |
| 基本单位 | `FBaseUnitId` | — | 基础资料对象 |
| 供应商 | `FSupplierId` | — | 基础资料对象 |
| 批号 | `FLot` | — | 字符串 |
| 生产车间 | `FWorkshopId` | — | 基础资料对象 |

---

## 四、检验项目表体（FItemDetail）关键字段

**解决"未命名项目"问题的核心字段**：

| 名称 | 标识 | 说明 |
|------|------|------|
| **检验项目** | **`FInspectItemId`** | **基础资料对象，`.Name` 属性即为项目名称** |
| 检验结果 | `FInspectResult1` | 默认 `1`，`true`（必填） |
| 检验值(定量) | `FInspectValQ` | 数值 |
| 检验值(定性) | `FInspectValB` | 基础资料对象 |
| 检验值(其他) | `FInspectValT` | 字符串 |
| 目标值 | `FTargetVal` | 字符串 |
| 分析方法 | `FAnalysisMethod` | `true`（必填），默认 `2` |
| 缺陷等级 | `FDefectLevel1` | `true`（必填），默认 `2` |
| 检验方法 | `FInspectMethodId` | 基础资料对象 |
| 检验仪器 | `FInspectInstrumentId` | 基础资料对象 |
| 质量标准 | `FQualityStdId` | 基础资料对象 |
| 上限值文本 | `FUpLimitT` | 字符串 |
| 下偏差 | `FDownOffset` | 字符串 |
| 上偏差 | `FUpOffset` | 字符串 |
| 破坏性检验 | `FDestructInspect` | 布尔，默认 `False` |
| 允收数 | `FAcceptQty1` | 数值 |

### "未命名项目"问题分析

当前代码中 `convertBillToLocal` 已经尝试从 `FInspectItemId` 基础资料对象中提取 `.name`，但图片中仍显示"未命名项目"。

**可能原因**：
1. View 接口返回的字段名可能是 `FInspectItemID`（大写 D）而非 `FInspectItemId`
2. 基础资料对象中的名称字段可能是 `FName` 而非 `Name`
3. `FInspectItemId` 返回的是字符串编码而非对象

**修复策略**：
- 在 `convertBillToLocal` 中增加对 `FInspectItemID`（全大写）的查找
- 增加对 `FName` 字段的直接提取
- 若基础资料对象为空，回退显示 `item_id`（编码）

---

## 五、单据类型编码映射（已知）

| 金蝶编码 | 中文名称 |
|---------|---------|
| JYD001_SYS | 来料检验 |
| JYD002_SYS | 过程检验 |
| JYD003_SYS | 出货检验 |

**BillQuery 中可取**：
- `FBILLTYPEID.FNumber` → 编码（如 JYD001_SYS）
- `FBILLTYPEID.FName` → 中文名称（如来料检验）

---

## 六、View 接口请求格式确认

与当前代码一致：
```json
{
  "formid": "QM_InspectBill",
  "data": {
    "CreateOrgId": 0,
    "Number": "",
    "Id": "",
    "IsSortBySeq": "false"
  }
}
```

---

## 七、Save 接口注意事项

- `IsDeleteEntry` 必须为字符串 `"false"`
- 基础资料字段回传格式为 `{ FNUMBER: "编码" }` 或 `{ FNumber: "编码" }`
- 只传需要更新的字段和分录

---

**记录人**: Claude Code
**关联记忆**: [[kingdee-qm-inspectbill-fields]]
