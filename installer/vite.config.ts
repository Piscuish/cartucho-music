import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

// Interfaz del instalador propio (sin React: es una ventana pequeña y debe pesar poco).
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  clearScreen: false,
  server: { port: 1430, strictPort: true, watch: { ignored: ["**/src-tauri/**"] } },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    assetsInlineLimit: 0,
  },
});
