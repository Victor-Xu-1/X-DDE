import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://127.0.0.1:4320" } },
  build: {
    outDir: "../src/opendde_workbench/web",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        app: "index.html",
        viewer: "viewer.html",
        molecular: "molecular.html",
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    css: { include: [/tokens\.css/] },
  },
});
