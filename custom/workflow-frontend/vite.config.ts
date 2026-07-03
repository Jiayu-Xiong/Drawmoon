import { defineConfig } from "vite"
import solidPlugin from "vite-plugin-solid"
import tailwindcss from "@tailwindcss/vite"
import { resolve } from "node:path"

const xyRoot = resolve(__dirname, "../..")
const backendSrc = resolve(__dirname, "../../backend/opencode/src")

export default defineConfig({
  plugins: [solidPlugin(), tailwindcss()],
  define: {
    __XY_MONOREPO_ROOT__: JSON.stringify(xyRoot),
  },
  resolve: {
    alias: {
      "@opencode-ai/backend-opencode": backendSrc,
    },
  },
  server: {
    host: "127.0.0.1",
    port: 4322,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3456",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/workflow-output": {
        target: "http://127.0.0.1:3456",
        changeOrigin: true,
      },
    },
  },
})
