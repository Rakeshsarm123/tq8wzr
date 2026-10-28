import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    // ECharts (tree-shaken to the parts we use) is most of the bundle; ~260 kB gzipped is acceptable here.
    chunkSizeWarningLimit: 900,
  },
  server: {
    proxy: { "/api": "http://localhost:8000" },
  },
});
