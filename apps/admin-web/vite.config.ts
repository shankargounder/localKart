import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  if (env.LOCALKART_DEMO_BUILD === "true") {
    let valid = false;
    try {
      const url = new URL(env.VITE_API_URL || "");
      valid =
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        url.pathname.endsWith("/api/v1") &&
        !/^(localhost$|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1)/i.test(
          url.hostname,
        ) &&
        !url.hostname.endsWith(".local");
    } catch {
      /* Fail without printing configuration values. */
    }
    if (!valid)
      throw new Error(
        "Pilot admin builds require a public HTTPS VITE_API_URL ending in /api/v1",
      );
  }
  return { plugins: [react()] };
});
