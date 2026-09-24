import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite-plus";

export default defineConfig(({ mode }) => ({
  // テストは Node 上で app.request() を叩くため Workers ランタイム（リモート AI 含む）は起動しない
  plugins: mode === "test" ? [] : [cloudflare()],

  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      // src/platform/ は D1 / Workers AI / Rate Limiting のバインディングを呼ぶだけの薄い層。
      // Node 上の vp test ではバインディングが無いので計測対象から外し、ロジックは src/domain/ に寄せる
      exclude: ["src/**/*.test.{ts,tsx}", "src/platform/**"],
      reporter: ["text", "html", "json-summary"],
      thresholds: {
        lines: 100,
        functions: 100,
        statements: 100,
        branches: 95,
        // 日付の正規化・ステータス判定・AI 応答の検証（ROADMAP で「テストを厚くする」部分）
        "src/domain/**": {
          perFile: true,
          lines: 100,
          functions: 100,
          statements: 100,
          branches: 100,
        },
      },
    },
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
