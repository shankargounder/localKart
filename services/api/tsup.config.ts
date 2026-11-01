import { defineConfig } from "tsup";
export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  outDir: "dist",
  splitting: false,
  clean: true,
  noExternal: ["@localkart/shared"],
});
