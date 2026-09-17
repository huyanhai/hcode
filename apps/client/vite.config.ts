import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import electron from "vite-plugin-electron/simple";
import packageJson from "./package.json" with { type: "json" };
import Components from "unplugin-vue-components/vite";
import AutoImport from "unplugin-auto-import/vite";
import RekaResolver from "reka-ui/resolver";

export default defineConfig(({ command, mode }) => ({
  base: "./",
  plugins: [
    vue(),
    tailwindcss(),
    Components({ dts: true, resolvers: [RekaResolver()] }),
    AutoImport({
      imports: [
        "vue", // 自动导入 Vue 的 API，如 ref、reactive 等
        "vue-router", // 自动导入 Vue Router 的 API
        "@vueuse/core", // 自动导入 VueUse 的工具函数
        "pinia", // 自动导入 Pinia 的状态管理函数
      ],
      dts: "src/auto-imports.d.ts", // 生成类型声明文件
      vueTemplate: true, // 支持在模板中直接使用自动导入的 API
    }),
    mode !== "web" &&
      electron({
        main: {
          async onstart({ startup }) {
            await startup(["."]);
          },
          vite: {
            build: {
              outDir: "dist/main",
              emptyOutDir: true,
              target: "node22",
              sourcemap: command === "serve",
              rolldownOptions: {
                input: "electron/main.ts",
                output: { format: "cjs", entryFileNames: "[name].cjs" },
              },
            },
          },
        },
        preload: {
          input: "electron/preload.ts",
          async onstart({ startup }) {
            await startup(["."]);
          },
          vite: {
            build: {
              outDir: "dist/preload",
              emptyOutDir: true,
              target: "node22",
              sourcemap: command === "serve",
              rolldownOptions: {
                output: { entryFileNames: "[name].cjs" },
              },
            },
          },
        },
      }),
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __VUE_I18N_FULL_INSTALL__: true,
    __VUE_I18N_LEGACY_API__: false,
    __INTLIFY_PROD_DEVTOOLS__: false,
  },
  server: { host: "127.0.0.1", port: 5173 },
  preview: { host: "127.0.0.1", port: 4173 },
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true,
  },
}));
