# 金蝶云星空 API 字段解析与调试规范

## 何时使用

当应用出现以下症状时使用本 skill：
- 详情页显示"网络异常"但调试界面有数据
- 字段显示为"-"或空值，但 API 确实返回了数据
- 页面反复发送请求导致成功/失败交替出现
- 金蝶 View/BillQuery API 返回的字段与预期不匹配

## 核心问题模式

### 模式 1：字段名不匹配（最常见）

金蝶不同接口返回的字段命名规则不一致：

| 场景 | 字段名示例 |
|------|-----------|
| BillQuery | `FBILLNO`, `FMATERIALID`（全大写+ F前缀） |
| View API（标准） | `FBillNo`, `FMaterialID`（驼峰+ F前缀） |
| View API（混合） | `Id`, `BillNo`, `DocumentStatus`（**无 F前缀**） |

**根因**：`convertBillToLocal` 使用硬编码字段名查找，当实际字段名不同时解析为空。

### 模式 2：useFocusEffect 反复触发

React Native 的 `useFocusEffect` 在页面获得焦点时会反复执行，导致：
- 短时间内多次请求同一接口
- 前一次请求还没完成，后一次又发起
- 成功和超时的 toast 交替出现

### 模式 3：请求超时踩线

金蝶 View 接口查询大数据量时可能耗时 15-20 秒，如果 `REQUEST_TIMEOUT = 20000`，刚好在临界点附近，导致间歇性超时。

## 系统性诊断流程

### 第一步：在请求日志中记录关键信息

在 `fetchDetail` / `fetchOrders` 中增加详细日志：

```typescript
const logs: string[] = [];
const addLog = (msg: string) => {
  const time = new Date().toLocaleTimeString('zh-CN');
  logs.push(`[${time}] ${msg}`);
};

// 每个关键步骤都记录
addLog('开始加载详情');
addLog(`cacheKey=${cacheKey}`);
addLog('找到本地缓存');
addLog('调用 viewInspectBill...');
addLog('viewInspectBill 返回成功');
```

### 第二步：打印实际字段名列表

这是最关键的诊断信息：

```typescript
const billRecForDiag = bill as unknown as Record<string, unknown>;
const billFields = Object.keys(billRecForDiag);
addLog(`主表字段数=${billFields.length}`);
addLog(`主表字段列表=${billFields.join(', ')}`);
```

用户截图中的字段列表直接揭示了命名规则。

### 第三步：检查各步骤执行结果

```typescript
addLog(`bill.FID=${billRecForDiag.FID}`);        // 可能 undefined
addLog(`bill.Id=${billRecForDiag.Id}`);          // 可能有值
addLog(`bill.FBillNo=${billRecForDiag.FBillNo}`); // 可能 undefined
addLog(`bill.BillNo=${billRecForDiag.BillNo}`);   // 可能有值
```

## 修复规范

### 规范 1：字段解析必须使用不区分大小写+多候选查找

**禁止**：
```typescript
// ❌ 硬编码单一名称
order_no: bill.FBillNo || '',
```

**必须**：
```typescript
// ✅ 尝试多种变体
function findField(obj: Record<string, unknown>, candidates: string[]): string | undefined {
  for (const key of candidates) {
    if (key in obj) return key;
  }
  const lowerMap = Object.fromEntries(
    Object.keys(obj).map((k) => [k.toLowerCase(), k])
  );
  for (const key of candidates) {
    const actual = lowerMap[key.toLowerCase()];
    if (actual) return actual;
  }
  return undefined;
}

const billNoKey = findField(billRec, ['FBILLNO', 'FBillNo', 'BillNo']);
order_no: billNoKey ? resolveString(billRec, billNoKey) || '' : '';
```

**候选字段名必须覆盖所有已知变体**：
- `FID`, `Id`
- `FBILLNO`, `FBillNo`, `BillNo`
- `FDate`, `Date`
- `FBillTypeID`, `BillTypeID`
- `FDocumentStatus`, `DocumentStatus`
- `FCreatorID`, `FCreatorId`, `CreatorId`
- `FApproverID`, `FApproverId`, `ApproverId`
- `FCreateDate`, `CreateDate`
- `FEntity`, `Entity`
- `FItemDetail`, `ItemDetail`

### 规范 2：useFocusEffect 必须防重入

```typescript
const hasFetchedRef = useRef(false);

useFocusEffect(
  useCallback(() => {
    const init = async () => {
      if (!hasFetchedRef.current) {
        hasFetchedRef.current = true;
        fetchDetail({ silent: hasCache });
      }
    };
    init();
  }, [fetchDetail])
);

const onRefresh = useCallback(() => {
  setRefreshing(true);
  hasFetchedRef.current = false; // 重置，允许重新请求
  fetchDetail();
}, [fetchDetail]);
```

**列表页同理**，移除定时轮询：
```typescript
// ❌ 不要自动轮询
// const POLL_INTERVAL = 30 * 1000;

// ✅ 只在首次加载和手动刷新时请求
```

### 规范 3：超时时间必须留有余量

```typescript
// ❌ 刚好踩线
const REQUEST_TIMEOUT = 20000;

// ✅ 留有余量（金蝶 View 接口可能耗时 15-20 秒）
const REQUEST_TIMEOUT = 45000;
```

### 规范 4：extractViewResult 必须防御性检查

```typescript
function extractViewResult<T>(raw: unknown): T {
  // ... 错误检查 ...

  let data: unknown;
  // ... 提取逻辑 ...

  // ✅ 防御性检查
  if (data === null || data === undefined) {
    throw new Error('查询详情失败：返回数据为空');
  }
  if (Array.isArray(data)) {
    throw new Error('查询详情失败：返回数据为数组而非对象');
  }
  if (typeof data !== 'object') {
    throw new Error(`查询详情失败：返回数据格式异常（类型: ${typeof data}）`);
  }

  return data as T;
}
```

### 规范 5：调试信息无论成功失败都要保存

```typescript
try {
  const bill = await viewInspectBill(identifier);
  // 成功时保存调试数据
  await AsyncStorage.setItem('__debug_last_kingdee_response', JSON.stringify({
    stage: 'success',
    rawResult: bill,
    // ...
  }));
} catch (error) {
  const message = error instanceof Error ? error.message : '加载失败';
  // ❌ 不要只 console.error，要保存到 AsyncStorage
  await AsyncStorage.setItem('__debug_last_kingdee_response', JSON.stringify({
    stage: 'error',
    error: message,
    // ...
  }));
}
```

## 验证清单

修复后必须验证：

- [ ] 打开页面只发送一次请求（检查日志）
- [ ] 下拉刷新能正常重新请求
- [ ] 切换筛选按钮后立即重新请求
- [ ] 详情页字段正确显示（不为"-"）
- [ ] 请求日志中 `order_no=` 有值
- [ ] 不再出现"网络异常"toast（除非真断网）

## 常见字段映射速查表

| 业务含义 | BillQuery | View API（标准） | View API（混合） |
|---------|-----------|-----------------|-----------------|
| 单据内码 | `FID` | `FID` | `Id` |
| 单据编号 | `FBILLNO` | `FBillNo` | `BillNo` |
| 单据日期 | `FDate` | `FDate` | `FDate` |
| 单据类型 | `FBILLTYPEID` | `FBillTypeID` | `FBillTypeID` |
| 单据状态 | `FDocumentStatus` | `FDocumentStatus` | `DocumentStatus` |
| 创建人 | - | `FCreatorId` | `CreatorId` |
| 审核人 | - | `FApproverId` | `ApproverId` |
| 创建日期 | - | `FCreateDate` | `CreateDate` |
| 审核日期 | - | `FApproveDate` | `ApproveDate` |
| 表体 | - | `FEntity` | `Entity` |

## 相关文件

- `api/kingdee/inspect.ts` — `convertBillToLocal` 字段解析
- `api/kingdee/utils.ts` — `resolveString`, `resolveNumber`, `resolveBaseData`
- `api/kingdee/client.ts` — `REQUEST_TIMEOUT`
- `screens/order-detail/index.tsx` — `fetchDetail`, `useFocusEffect`
- `screens/order-list/index.tsx` — `fetchOrders`, 轮询逻辑
