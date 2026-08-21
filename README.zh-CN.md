# better-dsh-sidebar

在 VS Code 侧边栏中通过**独立 profile** 运行 **DeepSeek Harness**，并使用专门为侧边栏适配的 UI。无需打开浏览器、切换窗口；插件自动管理 dsh 服务进程、嵌入界面和窄屏布局，并提供一键在浏览器打开、切换 profile、重启服务等常用操作。

## 功能特性

### 侧边栏内嵌运行

- 点击活动栏的 **DeepSeek Harness** 图标，即可在侧边栏中直接使用 Harness。
- 也可以用命令在 VS Code 内置的 Simple Browser 中打开。

### 独立实例，绝不污染个人 profile

- 默认使用专用 profile `web-vscode` 启动服务，与你的个人 `web` profile 完全隔离。
- 首次使用自动完成 profile 初始化（内置基础 bundle），并自动安装随附的窄屏插件，全程无需手动配置。

### 侧边栏工具栏

界面顶部有一条工具栏，常用操作一步到位：

| 控件 | 作用 |
| --- | --- |
| **服务地址**（可点击） | 显示当前服务 `ip:port`；点击在系统默认浏览器中打开 |
| **Profile 下拉框** | 在 `web` 与 `web-vscode` 等 profile 之间即时切换，自动重启服务并持久化设置 |
| **重启 ⟳** | 一键重启 dsh 服务（端口为自动分配时会重新挑选） |

### 窄屏适配

- 面板宽度小于 1024px 时，界面自动变为手机布局：抽屉式导航、全宽对话、移动端设置。
- 桌面宽度下与正常界面完全一致。
- 基于 [`dsh-web-mobile`](https://github.com/mexiaosqwq/dsh-web-mobile) 项目的布局方案。

## 环境要求

| 依赖 | 说明 |
| --- | --- |
| `dsh` CLI（>= 0.1.0-rc.7） | 需在 `PATH` 中，或通过设置 `dshharness.dshBin` 指定路径 |
| `pnpm` | 仅在首次初始化专用 profile 时需要（安装随附的窄屏插件） |
| `dsh-mobile-nav` | 无需安装，扩展已内置一份 |

## 快速开始

1. 安装本扩展。
2. 点击活动栏中的 **DeepSeek Harness** 图标打开侧边栏。
3. 首次使用会自动初始化 profile 并启动服务，稍等片刻即可开始使用。

## 使用说明

### 侧边栏工具栏

- **在浏览器中打开**：点击工具栏左侧的服务地址（`ip:port`），会在系统默认浏览器中打开当前界面。
- **切换 profile**：从下拉框选择目标 profile，扩展会重启服务并记住你的选择；切换到个人 `web` profile 时会原样启动，不会对它做任何修改。
- **重启服务**：点击 ⟳ 按钮停止并重新启动 dsh 服务，界面会自动刷新。

### 安装插件到侧边栏

侧边栏就是一个独立的 dsh profile（`web-vscode`），可以像平时一样安装插件，不会影响个人 `web` profile：

```sh
dsh plugin --profile web-vscode add <包名 | link:/绝对路径 | github:user/repo>
dsh plugin --profile web-vscode remove <包名>
```

也可以使用命令面板中的 **DeepSeek Harness: Install Plugin into Sidebar Profile**。安装后重启服务（先 Stop Server 再 Open Panel）即可生效。Git 托管的插件在构建时可能需要 pnpm 的 `allowBuilds` 审批。

## 命令

| 命令 | 说明 |
| --- | --- |
| **DeepSeek Harness: Open Panel** | 启动服务（如未运行）并打开侧边栏视图 |
| **DeepSeek Harness: Open in Simple Browser** | 启动服务（如未运行）并在内置 Simple Browser 中打开 |
| **DeepSeek Harness: Install Narrow-Screen Support (dsh-mobile-nav)** | 将随附的窄屏支持重新安装到专用 profile |
| **DeepSeek Harness: Install Plugin into Sidebar Profile** | 将任意插件安装到侧边栏 profile |
| **DeepSeek Harness: Stop Server** | 停止正在运行的 dsh 服务 |

## 设置

| 设置项 | 默认值 | 说明 |
| --- | --- | --- |
| `dshharness.dshBin` | `dsh` | dsh CLI 的路径或命令名 |
| `dshharness.profile` | `web-vscode` | 侧边栏使用的 dsh profile（除个人 `web` 外会自动初始化）；可在工具栏中切换 |
| `dshharness.host` | `127.0.0.1` | 服务绑定的回环地址 |
| `dshharness.port` | `0` | 服务端口；`0` 为自动挑选空闲端口 |
| `dshharness.mobileNavPath` | （空） | 指定你自己的 `dsh-mobile-nav` 检出路径；留空使用内置副本 |
| `dshharness.openOnStart` | `true` | 启动 VS Code 时恢复上次打开的面板 |

## 工作原理

- **独立实例**：扩展为侧边栏启动独立 dsh profile，界面只加载 Harness 基础 bundle 与窄屏插件，不包含 `dshmarket`、智能体团队等其他内容。
- **服务管理**：自动挑选空闲端口、等待服务就绪，随面板/扩展关闭而停止。
- **安全嵌入**：侧边栏使用与 VS Code Simple Browser 相同的 iframe 方案（CSP `frame-src *` + 固定 sandbox）加载本地 HTTP 界面，规避了自写 iframe 易出现的空白屏问题。

## 开发与打包

### 开发

```sh
npm install
npm run compile   # tsc -> out/
```

编译完成后按 F5 启动扩展开发主机进行调试。

### 打包

```sh
npm run package   # 生成 better-dsh-sidebar-*.vsix
```

## 许可证

[MIT](LICENSE)
