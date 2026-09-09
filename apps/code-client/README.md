# Code Client

HCode 桌面客户端，包名为 `@hcode/code-client`。

## 技术栈

| 依赖 | 版本 |
| --- | --- |
| Vite | 8.2.2 |
| Electron | 44.2.0 |
| electron-builder | 26.15.3 |
| Vue | 3.5.42 |
| Tailwind CSS | 4.3.3 |
| Pinia | 4.0.3 |
| Vue Router | 5.3.1 |
| Vue I18n | 11.4.10 |

版本在 2026-09-08 查询并锁定。使用兼容 Vite 8 的 `vite-plugin-electron` 1.1.2；TypeScript 使用 ESLint 工具链支持的 6.0.3。

## 目录

```text
code-client/
├── electron/
│   ├── main.ts             # 窗口创建、生命周期与权限限制
│   └── preload.ts          # 向渲染层暴露只读桌面信息
├── shared/                 # 主进程与渲染层共享的类型
├── src/
│   ├── i18n/locales/       # 中英文消息
│   ├── router/             # Hash 路由
│   ├── stores/             # Pinia 偏好设置与本地持久化
│   ├── styles/             # Tailwind CSS 与样式令牌
│   ├── views/              # 首页、设置页
│   ├── App.vue
│   └── main.ts
├── electron-builder.yml
├── eslint.config.mjs
├── index.html
├── package.json
├── tsconfig*.json
└── vite.config.ts
```

## 本地开发

在仓库根目录执行：

```sh
pnpm install
pnpm --filter @hcode/code-client dev
```

Vite 启动后自动打开 Electron。渲染层支持 HMR，修改主进程或 preload 会重新构建并重启桌面窗口。默认地址为 `http://127.0.0.1:5173`，端口被占用时自动使用后续可用端口。

只启动浏览器中的渲染层：

```sh
pnpm --filter @hcode/code-client dev:web
```

Electron 首次运行可能需要联网下载平台运行时。pnpm 的构建脚本许可在根目录 `pnpm-workspace.yaml` 中管理。

## 检查与构建

```sh
pnpm --filter @hcode/code-client lint
pnpm --filter @hcode/code-client typecheck
pnpm --filter @hcode/code-client build
pnpm --filter @hcode/code-client preview
```

`build` 先完成类型检查，再生成 `dist/main/main.cjs`、`dist/preload/preload.cjs` 和 `dist/renderer/`。浏览器预览只提供渲染层；桌面环境通过 preload 注入 `window.desktop`。

## 桌面打包

```sh
# 生成当前平台的应用目录，用于本地检查
pnpm --filter @hcode/code-client package:dir

# 生成当前平台的安装包
pnpm --filter @hcode/code-client package
```

产物位于 `release/`。默认目标为 macOS DMG、Windows NSIS 和 Linux AppImage；在对应操作系统中执行构建。发布前需在 `electron-builder.yml` 中确定最终 `appId`、应用图标，并通过 CI 环境配置签名及 macOS 公证凭据。

## 约定

- 渲染层使用 Hash 路由和相对静态资源路径，支持安装包内的 `file://` 页面加载。
- 主进程和 preload 编译为 CommonJS，preload 使用沙箱支持的 `.cjs` 扩展名。
- 保持 `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`。新桌面能力通过明确的 preload API 暴露，并在主进程验证 IPC 调用。
- 当前默认拒绝新窗口、外部导航及权限请求，业务需要时按用途添加授权规则。
- 语言设置由 Pinia 管理并保存在本地；存储不可用时，当前会话仍可切换语言。
- Tailwind CSS 通过 `@tailwindcss/vite` 集成，主题令牌定义在 `src/styles/main.css`。
