# dsh-web-mobile

尽可能的使 dsh 适配竖屏等移动端设备

[![Release v1.5.0](https://img.shields.io/badge/release-v1.5.0-5B4CF0?style=flat-square)](package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-0B7285?style=flat-square)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-Web%20Profile-5B4CF0?style=flat-square)](cordis.patch.yml)

## 效果

| 会话主页(全宽) | 目录抽屉 | 设置界面 |
| --- | --- | --- |
| ![移动端会话主页](assets/hero.png) | ![目录抽屉](assets/drawer.png) | ![移动端设置界面](assets/settings.png) |

## 特性

- **状态栏适配**:保留系统状态栏,`viewport-fit=cover` + `env(safe-area-inset-top)` 避让刘海,`theme-color` 跟随深/浅主题,禁用双击缩放;
- **会话全宽 + 抽屉导航**:网格改 `1fr 0 0`,侧栏变 overlay 抽屉;点会话行切换并收起抽屉,行内按钮(三点菜单)不收起;
- **会话头部重排**:目录按钮 / 会话名称 / 模式徽标按移动端排列,Session log 移到抽屉底部;
- **设置界面适配**:官方双栏弹窗改近全宽 sheet——分类标签单行横向滚动,顶部工具栏并入标签行,手机上隐藏「打开配置文件」;
- **文件树 / 预览浮层**:Explorer 与 Preview 变圆角底部浮层(滑入动画),文件行一步打开预览,浮层可一键全屏并自动还原;
- **统计栏一行滚动**:轮数 / 步骤 / 耗时 / TTFT / 缓存 / token 收进单行横向滚动条;
- **输入区适配**:权限胶囊与模型名不重叠,模型名完整显示,切换菜单水平居中;
- **会话行操作菜单**:长按/右键会话行出现三点按钮(重命名 / Fork / 归档),弹出时抽屉保持打开;
- **平板适配**:768–1023px 下弹窗与浮层限宽居中;桌面端(≥1024px)完全 no-op;
- **诊断**:访问 `?mobile-nav-debug=1` 显示悬浮诊断条(视口 / 浮层状态 / JS 错误),手机端问题取证用;
- **触觉反馈**:通用设置新增「点按振动」开关与强度选择(轻 / 中 / 强),仅移动端生效,桌面端自动隐藏。

## 更新日志

### v1.5.0

**新增 / 改进**

- 触觉反馈:设置新增「点按振动」开关与强度选择(轻 / 中 / 强,本地存储偏好,跨标签同步),点按控件即时振动,桌面端不显示该设置行。

**修复**

- 抽屉关闭交互回归:移除旧 MobileNavOverlay 组件时误删的背板点击关闭、Escape 关闭、抽屉内导航点击收起、hero/blank 阶段悬浮按钮四项交互全部恢复;
- preview/explorer 互斥对称:打开 explorer 前先清 preview 标记,收起/关闭路径对称,预览浮层不再误开或残留标记;
- dispose 还原完整:设置工具栏、统计条、aionui sheet 标记在退出移动端布局时回到官方位置,桌面端无残留;
- 预览全屏按钮 aria-label 同步真实动作(「全屏预览」/「退出全屏」)。

**内部**

- reconciler 热路径优化:抽出零依赖 DOM-free 引擎 `reconciler-core`(node:test 5 例覆盖生命周期 / 脏路由 / 合并 / 错误隔离),MutationObserver 按脏键路由,8 个任务赋 scopes,流式 flush 从 8/8 降至 5/8;
- CSS 模块自包含、effect 分层清理;
- CDP 回归门禁 `smoke:cdp`:覆盖抽屉 / 桌面 no-op / gitgraph 集成。

## 兼容插件

- [dsh-web-ui 全家桶](https://www.npmjs.com/package/@linxin666/dsh-web-ui-all)——**0.1.14**
- [dshmarket](https://www.npmjs.com/package/dshmarket)——**1.2.2**
- [dsh-usage-stats](https://github.com/Ychris12138/dsh-usage-stats)——**0.1.2**
- [dsh-genui](https://github.com/omdsh-dev/dsh-genui)——**0.8.3**

## 安装

```sh
dsh plugin --profile web add github:mexiaosqwq/dsh-web-mobile
```

仓库自带构建产物,一条命令直接安装,无 `allowBuilds` 拦截。装完重启 `dsh web`。

本地开发:`dsh plugin --profile web add link:/path/to/dsh-web-mobile`

## 构建

```sh
pnpm install
pnpm build
```

`lib/` 与源码同步入库,改动源码后重新构建再提交。

## 验证

- `pnpm verify` 类型检查;`dsh --profile web --dump-config` 应出现插件层;
- 移动端(390px):抽屉开合 / 遮罩 / Escape、设置弹窗适配、会话行三点菜单弹出时抽屉保持、文件/预览浮层;
- 桌面端(≥1024px):与未安装时一致;
- 回归门禁:`DSH_PROBE_SESSION_ID=... pnpm smoke:cdp`(需先启动目标 profile,连接默认 `http://127.0.0.1:3080/`)。

## License

[MIT](LICENSE)
