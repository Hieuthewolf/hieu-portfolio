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
});
