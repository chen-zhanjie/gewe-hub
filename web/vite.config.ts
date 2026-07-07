import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/webhook": "http://localhost:3000"
    }
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
      "@gewehub/contracts": new URL("../packages/contracts/src/index.ts", import.meta.url).pathname
    }
  }
});
