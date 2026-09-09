# hcode

基于 pnpm workspace 和 Turborepo 的 Monorepo，包含 Vue + Electron 桌面应用 `code-client`。

## 环境

- Node.js 22.13+（22.x）或 24+，建议使用受支持的 LTS 版本。
- pnpm 10.13.1，与 `package.json` 的 `packageManager` 保持一致。

## 目录

```text
hcode/
├── apps/                 # 可独立运行和部署的应用
│   └── code-client/      # Vite 8 + Vue + Electron 桌面客户端
├── packages/             # 共享工具、业务库及配置包
├── components/           # 可被多个应用复用的组件包
├── .editorconfig         # 编辑器格式约定
├── .gitignore
├── .npmrc                # pnpm 安装约定
├── package.json          # 根目录任务入口
├── pnpm-lock.yaml        # 全仓库共享的依赖锁文件
├── pnpm-workspace.yaml   # workspace 包发现规则
└── turbo.json            # 任务依赖和缓存规则
```

桌面应用位于 `apps/code-client`，启动与打包说明见 [Code Client README](apps/code-client/README.md)。`packages/` 和 `components/` 暂时保留占位文件；新增共享包时创建一级子目录并提供独立的 `package.json`。

## 命令

```sh
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm package:dir
pnpm package
```

根目录脚本通过 Turbo 调度各包中同名的脚本。`pnpm dev` 启动 Electron 客户端；只启动网页渲染层可使用 `pnpm --filter @hcode/code-client dev:web`。当前尚未接入业务测试，子包按需要提供 `test` 脚本。

`build` 先构建 workspace 依赖，缓存 `dist/` 和 `build/`；`test` 先构建 workspace 依赖，缓存 `coverage/`。`dev` 是常驻任务，不使用缓存。应用采用其他产物目录时，需要同步调整 Turbo 的 `outputs` 和 `.gitignore`；有影响构建结果的环境变量时，需要在 Turbo 中声明 `env` 或 `globalEnv`。

`package` 和 `package:dir` 先构建 workspace 依赖，再执行子包的构建与打包脚本，桌面打包不使用 Turbo 缓存。

## 添加包与依赖

包名建议使用 `@hcode/*`，内部依赖使用 `workspace:*`。每个子包自行声明直接依赖，根目录只安装仓库级开发工具。

以下命令适用于已创建对应子包的情况：

```sh
pnpm --filter @hcode/code-client add lodash-es
pnpm --filter @hcode/code-client add '@hcode/utils@workspace:*'
pnpm add -Dw <tool>
pnpm --filter @hcode/code-client dev
```

提交 `pnpm-lock.yaml`，在 CI 中使用 `pnpm install --frozen-lockfile` 安装依赖。
