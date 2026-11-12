import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

// 版本号：单一来源是 package.json 的 version；构建时附上 git 短哈希，
// 部署到 GitHub Pages 后玩家在页面头部即可核对线上版是不是最新提交。
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"));
const commit = (() => {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "dev";
  }
})();

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __COMMIT__: JSON.stringify(commit),
  },
  plugins: [react(), tailwindcss()],
  server: {
    host: "::",
    port: 43123,
    strictPort: true,
  },
  preview: {
    host: "::",
    port: 43123,
    strictPort: true,
  },
  test: {
    // This local Hook suite uses node:test, not Vitest; run with node --test.
    exclude: [...configDefaults.exclude, "tools/codex-sync.test.cjs"],
    environment: "jsdom",
    setupFiles: fileURLToPath(new URL("./src/test/setup.ts", import.meta.url)),
  },
});
