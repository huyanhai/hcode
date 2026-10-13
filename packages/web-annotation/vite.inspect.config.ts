import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/inspect.ts",
      name: "HInspect",
      formats: ["iife"],
      fileName: () => "iife/index.js",
    },
    emptyOutDir: false,
  },
});
