import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const root = resolve(__dirname, "src/renderer");

export default defineConfig({
  root,
  base: "./",
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, "dist/renderer"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        pet: resolve(root, "pet.html"),
        chat: resolve(root, "chat.html"),
        bubble: resolve(root, "bubble.html"),
        settings: resolve(root, "settings.html")
      }
    }
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
