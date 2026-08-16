import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    ssr: path.resolve("electron/main.ts"),
    outDir: path.resolve("dist-electron"),
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    target: "node22",
    rollupOptions: {
      external: ["electron", "better-sqlite3"],
      output: {
        format: "es",
        entryFileNames: "main.js",
      },
    },
  },
});
