import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"]
  },
  resolve: {
    alias: {
      "@gewehub/contracts": new URL("../packages/contracts/src/index.ts", import.meta.url).pathname
    }
  }
});
