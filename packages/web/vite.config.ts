import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Absolute path so Relay resolves artifacts regardless of where Vite is launched.
const artifactDirectory = fileURLToPath(new URL("./src/__generated__", import.meta.url));

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-relay", { artifactDirectory, eagerEsModules: true }]],
      },
    }),
  ],
  // Proxy /api/* (GraphQL + Better Auth) to the dev server so the browser stays
  // same-origin — session cookies and credentialed Relay requests just work.
  server: {
    proxy: {
      "/api": { target: "http://localhost:4000", changeOrigin: true },
    },
  },
});
