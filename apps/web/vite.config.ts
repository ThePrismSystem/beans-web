import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { codecovVitePlugin } from "@codecov/vite-plugin";

export default defineConfig({
  plugins: [
    react(),
    codecovVitePlugin({
      enableBundleAnalysis: Boolean(process.env.CODECOV_TOKEN),
      bundleName: "beans-web-web",
      uploadToken: process.env.CODECOV_TOKEN,
    }),
  ],
  server: { proxy: { "/api": "http://localhost:4780" } },
});
