import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    target: "es2020"
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3535"
    }
  }
});
