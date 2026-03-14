import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { resolve } from "path";

export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "src/shared"),
      "@wasm": resolve(__dirname, "wasm-pkg/saladvault_crypto_wasm"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "popup.html"),
        "service-worker": resolve(__dirname, "src/background/service-worker.ts"),
        "content-script": resolve(__dirname, "src/content/content-script.ts"),
        offscreen: resolve(__dirname, "offscreen.html"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
    target: "esnext",
    minify: "esbuild",
  },
  worker: {
    format: "es",
  },
});
