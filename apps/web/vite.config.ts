import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@flight/game-logic": path.resolve(__dirname, "../../packages/game-logic/src/index.ts"),
      "@flight/locales": path.resolve(__dirname, "../../packages/locales/src/index.ts"),
      "@flight/types": path.resolve(__dirname, "../../packages/types/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
