import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: "index",
    },
    emptyOutDir: false,
    rollupOptions: {
      external: [/^lit(?:\/.*)?$/],
    },
  },
});
