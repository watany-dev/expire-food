import { USAGE_QUERY, formatUsage, parseUsage, usageWindow } from "../src/domain/usage";

// 無料枠の消費を直近 7 日分表示する。トークンは Account Analytics の読み取りだけでよい（README「無料枠の確認」）
const token = process.env.CLOUDFLARE_API_TOKEN;
const accountTag = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!token || !accountTag) {
  console.error("CLOUDFLARE_API_TOKEN と CLOUDFLARE_ACCOUNT_ID を設定してください");
  process.exit(2);
}

const { dates, variables } = usageWindow(accountTag, new Date());
const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: USAGE_QUERY, variables }),
});
try {
  const { text, warn } = formatUsage(parseUsage(await res.json().catch(() => null), dates));
  console.info(text);
  if (warn) process.exitCode = 1;
} catch (error) {
  console.error(`HTTP ${res.status}: ${(error as Error).message}`);
  process.exit(2);
}
