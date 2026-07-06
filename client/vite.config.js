import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  server: {
    // Dev-only: forward API calls to the Express server so the browser
    // never talks to the Claude API directly.
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
