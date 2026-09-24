import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite-plus";

export default defineConfig(({ mode }) => ({
  // テストは Node 上で app.request() を叩くため Workers ランタイム（リモート AI 含む）は起動しない
  plugins: mode === "test" ? [] : [cloudflare()],

  test: {
    include: ["src/**/*.test.{ts,tsx}"],
  },

  lint: {
    ignorePatterns: ["dist/**", "worker-configuration.d.ts", ".semgrep/**"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },

  fmt: {
    ignorePatterns: ["worker-configuration.d.ts", ".semgrep/**"],
  },

  staged: {
    "*.{js,ts,tsx,json,jsonc,md,yml,yaml}": "vp check --fix",
  },
}));
