import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2022",
  outDir: "dist",
  external: ["@bailin/character-protocol", "pngjs"],
  outExtension: ({ format }) => ({ js: format === "esm" ? ".js" : ".cjs" }),
  onSuccess: async () => {
    const { copyFileSync, existsSync } = await import("node:fs");
    if (existsSync("dist/index.d.ts")) copyFileSync("dist/index.d.ts", "dist/index.d.cts");
  }
});
