# 金蝶 QM_InspectBill Save API 使用规范

> 基于金蝶 OpenAPI 官方文档（https://openapi.open.kingdee.com/ApiHome）学习总结
> 版本：v1.2.22 更新

---

## 一、Save 接口请求结构

```json
{
  "formid": "QM_InspectBill",
  "data": {
    "Creator": "",
    "NeedReturnFields": [],
    "IsDeleteEntry": "false",
    "IsVerifyBaseDataField": "false",
    "IsEntryBatchFill": "true",
    "ValidateFlag": "true",
    "NumberSearch": "true",
    "Model": {
      "FID": "单据内码",
      "FBillTypeID": {"FNUMBER": "单据类型编码"},
      "FDate": "2024-01-01",
      "FInspectOrgId": {"FNumber": "组织编码"},
      "FEntity": [{
        "FEntryID": "分录内码",
        "FMaterialId": {"FNUMBER": "物料编码"},
        "FUnitID": {"FNumber": "单位编码"},
        "FInspectQty": 0,
        "FEntity_Link_FRuleId": "转换规则编码",
        "FEntity_Link_FSBillId": "源单内码",
        "FEntity_Link_FSTableId": "源单表内码",
        "FItemDetail": [...],
        "FDefectDetail": [...],
        "FPolicyDetail": [...]
      }]
    }
  }
}
```

### 关键控制参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `IsDeleteEntry` | string(bool) | `"true"` | **必须传 `"false"`**，否则已有分录会被删除 |
| `ValidateFlag` | string(bool) | `"true"` | 验证数据合法性 |
| `NeedUpDateFields` | Array | 不传 | **建议不传**，让金蝶根据 Model 自动判断 |

---

## 二、基础资料字段格式（⚠️ 必须精确匹配）

每个基础资料字段的键名是**固定的**，不能随意替换：

| 字段 | 格式 | 示例 |
|------|------|------|
| `FMaterialId` | `{"FNUMBER": "编码"}` | 全大写 |
| `FUnitID` | `{"FNumber": "编码"}` | 首字母大写 |
| `FStockId` | `{"FNumber": "编码"}` | 首字母大写 |
| `FInspectOrgId` | `{"FNumber": "编码"}` | 首字母大写 |
| `FBFLowId` | `{"FNAME": "名称"}` | 全大写 |
| `FPrdLineLocation` | `{"FLOCATIONCODE": "编码"}` | 全大写 |
| `FOrderType` | `{"FID": "内码"}` | 全大写 |
| `FStockLocId` | `{}` | 空对象 |

### 使用 `FNUMBER` 的字段（全大写）

`FMaterialId`, `FBillTypeID`, `FBomId`, `FCurrency`, `FInspectItemId`, `FInspectBasisId`, `FInspectInstrumentId`, `FInspectMethodId`, `FQualityStdId`, `FDefectTypeId`, `FDefectReasonId`, `FDefectResultId`, `FDSerialId`, `FPolicyMaterialId`, `FSerialId`, `FLot`, `FSampleSchemeId`, `FStockGroupId`, `FStockerId`, `FSupplierId`, `FCustomerId`, `FProductLineId`, `FWorkshopId`, `FBFLowId` 等

### 使用 `FNumber` 的字段（首字母大写）

`FUnitID`, `FBaseUnitId`, `FStockId`, `FInspectOrgId`, `FInspectDepId`, `FInspectorId`, `FSourceOrgId`, `FOwnerId`, `FKeeperId`, `FPrdUnitId`, `FSNUnitID`, `FValueUnitID`, `FUnitId2` 等

---

## 三、FEntity 分录字段

### 3.1 关联关系字段（🔥 关键）

**`FEntity_Link_FRuleId` 是 FEntity 分录上的平铺字段，不是子单据体数组！**

```json
{
  "FEntryID": 136330,
  "FMaterialId": {"FNUMBER": "M001"},
  ...
  "FEntity_Link_FRuleId": "QM_PURReceive2Inspect",
  "FEntity_Link_FSBillId": "",
  "FEntity_Link_FSTableId": "",
  "FEntity_Link_FSTableName": "",
  "FEntity_Link_FSId": ""
}
```

**注意**：
- 不需要构造 `FEntity_Link: [{...}]` 数组
- 不需要在 Model 根级别设置 `FEntity_Link_FRuleId`
- 不需要在 data 级别设置 `FEntity_Link_FRuleId`

### 3.2 子单据体结构

**FItemDetail（检验项目明细）**：
```json
{
  "FDetailID": 0,
  "FInspectItemId": {"FNUMBER": "编码"},
  "FInspectResult1": "合格",
  "FAnalysisMethod": "定量",
  "FQualityStdId": {"FNUMBER": "编码"},
  "FUnitId2": {"FNUMBER": "编码"},
  "FInspectValQ": 0,
  "FInspectValB": {"FNUMBER": "编码"},
  "FInspectValT": "",
  "FInspectMethodId": {"FNUMBER": "编码"},
  "FInspectInstrumentId": {"FNUMBER": "编码"},
  "FDefectlevel1": "",
  "FDestructInspect": "false",
  "FKeyInspect": "false",
  "FItemStatus": "",
  "FCompareSymbol": ""
}
```

**FDefectDetail（缺陷记录明细）**：
```json
{
  "FDetailID": 0,
  "FDSerialId": {"FNUMBER": "编码"},
  "FDefectTypeId": {"FNUMBER": "编码"},
  "FDefectQty": 0,
  "FBaseDefectQty1": 0,
  "FDefectReasonId": {"FNUMBER": "编码"},
  "FDefectLevel": "1",
  "FDefectResultId": {"FNUMBER": "编码"},
  "FDefectMemo": ""
}
```

**FPolicyDetail（使用决策明细）**：
```json
{
  "FDetailID": 0,
  "FPolicyMaterialId": {"FNUMBER": "编码"},
  "FPolicyStatus": "1",
  "FPolicyQty": 0,
  "FBasePolicyQty": 0,
  "FUsePolicy": "A",
  "FSerialId": {"FNUMBER": "编码"},
  "FIsCheck": "false",
  "FIsDefectProcess": "false",
  "FCanSale": "false",
  "FIsMRBReview": "false",
  "FIsReturn": "false",
  "FInstockFlag": "",
  "FMemo1": "",
  "FIBUsePolicy": ""
}
```

---

## 四、View API vs Save API 字段差异

| View API 返回 | Save API 要求 | 说明 |
|---------------|---------------|------|
| `Entity` | `FEntity` | 数组名不同 |
| `Id` | `FEntryID` | 分录内码 |
| `MaterialId` | `FMaterialId` | 加 F 前缀 |
| `UnitId` | `FUnitID` | 加 F 前缀，大小写 |
| `InspectQty` | `FInspectQty` | 加 F 前缀 |
| `Number` / `Name` / `Id` | `FNUMBER` / `FNumber` / `FNAME` | 基础资料对象格式 |

---

## 五、布尔值格式

**所有布尔值必须是字符串 `"true"` / `"false"`**，不能用 JavaScript 布尔值。

```json
{
  "FIsDefectProcess": "true",
  "FIsMRBReview": "false",
  "FDestructInspect": "false",
  "FKeyInspect": "false"
}
```

---

## 六、常见错误排查

| 错误信息 | 原因 | 解决方案 |
|----------|------|----------|
| `FEntity_Link_FRuleId必传` | 字段位置错误或格式错误 | 确保放在 `FEntity[0]` 上作为平铺字段，不是子数组 |
| `IsDeleteEntry` 导致数据丢失 | 默认 `"true"` 会删除已有分录 | 必须显式传 `"false"` |
| 基础资料验证失败 | 格式不正确 | 检查是否用了正确的 `FNUMBER`/`FNumber`/`FNAME` |
| 字段未更新 | NeedUpDateFields 限制 | 不传 NeedUpDateFields，让金蝶自动判断 |
