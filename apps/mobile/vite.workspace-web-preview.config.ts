import { defineConfig } from "vite";

export default defineConfig({
  root: "./web/workspace-web-preview",
  server: {
    host: "127.0.0.1",
    port: 30000,
    strictPort: true,
  },
});
