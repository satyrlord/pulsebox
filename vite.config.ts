import { defineConfig } from "vite";

export default defineConfig({
  base: "/pulsebox/",
  server: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
  },
  build: {
    emptyOutDir: true,
    target: ["chrome111", "edge111", "firefox114"],
  },
});
