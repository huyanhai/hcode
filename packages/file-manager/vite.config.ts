import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    lib: {
      entry: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
      formats: ["es"],
      fileName: () => "index.js",
    },
    rollupOptions: {
      // vue / pinia / codemirror 核心由宿主应用提供，避免重复打包两份运行时
      external: [
        "vue",
        "pinia",
        "codemirror",
        /^@codemirror\//,
        "lucide-vue-next",
      ],
    },
  },
});
