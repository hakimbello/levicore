import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function resolveManualChunk(id) {
  if (!id.includes("node_modules")) {
    return undefined;
  }
  if (id.includes("monaco-editor") || id.includes("@monaco-editor")) {
    return "monaco";
  }
  if (id.includes("@xterm/xterm") || id.includes("@xterm/addon-fit")) {
    return "xterm";
  }
  if (id.includes("react-dom") || id.includes("/react/")) {
    return "react-vendor";
  }
  return undefined;
}

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: false
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          return resolveManualChunk(id);
        }
      }
    }
  }
});
