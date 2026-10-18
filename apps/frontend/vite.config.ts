import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import process from "node:process";
import tailwindcss from '@tailwindcss/vite'


const host = process.env.TAURI_DEV_HOST;

export default defineConfig(() => ({
  plugins: [react(), tailwindcss(),
   ],

  // share the repo-root .env with the Rust shells: GOOGLE_* vars feed the
  // server/desktop via dotenvy, VITE_* vars feed the frontend from the
  // same file
  envDir: fileURLToPath(new URL("../../", import.meta.url)),

  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },

  clearScreen: false,

  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
