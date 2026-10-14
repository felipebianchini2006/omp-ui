import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  server: { port: 1420, strictPort: true, fs: { allow: [".", "/Applications/Claude.app/Contents/Resources"] } },
  build: { target: "safari16", outDir: "dist" },
});
