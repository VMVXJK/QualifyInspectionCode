# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

QualifyInspection — 面向手机/平板的 MES 质检应用，用于现场质检人员执行来料检验、过程检验、出货检验。技术栈为 **React Native + Expo (SDK 54)**。

- **手机**：锁定竖屏，不可横屏
- **平板**：允许横竖屏自由旋转
- 设计风格：柔和卡片风 + 工业蓝（主色 `#2563EB`）

## 常用命令

```bash
cd client
npm install
npx expo start --web --clear    # 启动 Web 预览
npx expo start --android        # 启动 Android
npx expo start --ios            # 启动 iOS（需 Mac）
```

> 当前项目已删除 `web/` 目录，所有开发在 `client/` 中进行。

## 架构与目录约定

### 路由层 (`app/`) vs 页面层 (`screens/`)

采用 **Expo Router 文件系统路由**，但 `app/` 下**仅做路由导出**，不直接写页面逻辑：

```
app/
├── _layout.tsx          # 根布局：Provider + Stack 导航 + useOrientationLock
├── index.tsx            # export { default } from '@/screens/order-list';
├── order-detail.tsx     # export { default } from '@/screens/order-detail';
└── +not-found.tsx       # 404
```

页面实现统一放在 `screens/` 下，通过 `@/screens/xxx` 别名导入。

### 核心组件 `Screen` (`components/Screen.tsx`)

所有页面必须包裹在 `Screen` 组件中。它是项目的核心容器，职责包括：

- **安全区管理**：统一使用 `View + padding` 手动管理，**禁止使用 SafeAreaView**
- **沉浸式 Header 支持**：通过 `safeAreaEdges={['left','right','bottom']}` 去掉顶部安全区
- **键盘避让**：自动检测子树中的 `ScrollView/FlatList/SectionList`；未检测到则外层自动包裹 `KeyboardAwareScrollView`
- **Uniwind 支持**：通过 `withUniwind(RawScreen)` 包裹，支持 Tailwind 类名

### 路由：`useSafeRouter` (`hooks/useSafeRouter.ts`)

**必须替代原生 `useRouter`**。采用 Payload 模式：

```tsx
const router = useSafeRouter();
router.push('/order-detail', { orderId: 123 });

// 接收端
const { orderId } = useSafeSearchParams<{ orderId: number }>();
```

参数通过 JSON + Base64 编码传递，解决 URI 编解码不对称、类型丢失、嵌套对象无法传递等问题。

### API 预留层 (`api/`)

已建好金蝶 API 切换点，但**页面代码中的 `fetch` 调用尚未完全迁移**：

- `api/client.ts`：基础 HTTP 客户端（`fetchJson` / `putJson` / `postJson` / `del`）。后续对接金蝶时在此修改 **baseURL、鉴权头、请求/响应拦截**。
- `api/inspection.ts`：按业务模块封装（检验单、物料、检验项、缺陷、决策）。后续对接金蝶时修改 **URL 路径和参数格式**即可，页面代码无需改动。

当前页面代码中仍有大量内联 `fetch('${API_BASE}/api/v1/...')`，后续应逐步替换为导入 `api/inspection.ts`。

### 方向锁定 (`hooks/useOrientationLock.ts`)

在 `app/_layout.tsx` 中全局调用。规则：

- 屏幕短边 `< 600`：手机，锁定 `PORTRAIT_UP`
- 屏幕短边 `>= 600`：平板，解锁允许横竖屏
- 监听 `Dimensions` 变化，旋转时自动重新判断

`app.config.ts` 中 `orientation: "default"` 配合运行时锁定实现。

### 样式

页面代码主要使用 **React Native `StyleSheet.create`** 写样式，颜色值直接硬编码（参考 `DESIGN.md` 中的色板）。`global.css` 是 Uniwind/Tailwind 的入口文件，但当前 Metro 配置为极简版本，Uniwind 的 CSS 预处理未完整生效。

## 数据模型

核心业务对象（详见 `DESIGN.md`）：

- **检验单** (`InspectionOrder`)：`order_no`, `type` (incoming/process/shipping), `supplier`, `status` (pending/inspecting/completed/rejected)
- **物料** (`Material`)：`material_code`, `material_name`, `quantity`, `sample_size`, `inspection_result` (pass/fail/pending)
- **检验项目** (`InspectionItem`)：`item_name`, `standard_value`, `upper_limit`, `lower_limit`, `test_value`, `is_qualified`
- **缺陷记录** (`Defect`)：`defect_type`, `defect_count`, `severity` (minor/major/critical)
- **使用决策** (`Decision`)：`status` (合格/不合格), `decision` (接收/让步接收/挑选/判退)

## 已知注意事项

1. `contexts/AuthContext.tsx` 是空壳实现，所有方法为空函数，后续需根据金蝶鉴权方式重写。
2. `metro.config.js` 当前为极简版本，仅返回 `getDefaultConfig(__dirname)`。若需恢复代理转发或 Uniwind 完整 CSS 处理，需重新配置。
3. 没有后端时，页面中的 `fetch` 调用会静默失败（被 `try-catch` 包裹）。