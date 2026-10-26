import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The React app runs on port 5173. Any request to /api is forwarded
// to the Express server on port 5000, so the code can just call "/api/...".
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:5000",
    },
  },
});
