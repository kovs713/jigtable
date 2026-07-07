import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import path from "path"
import { visualizer } from "rollup-plugin-visualizer"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    visualizer({
      filename: "dist/stats.html",
      open: true,
      gzipSize: true,
      brotliSize: true,
    }),
  ],
  resolve: {
    alias: {
      "@jigtable/jigsaw-core": path.resolve(
        __dirname,
        "../packages/jigsaw-core/src"
      ),
      "@jigtable/shared": path.resolve(__dirname, "../packages/shared/src"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
