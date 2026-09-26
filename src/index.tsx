import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { csrf } from "hono/csrf";
import { NONCE, secureHeaders } from "hono/secure-headers";

import { api, rotate } from "./routes/api";
import { extract } from "./routes/extract";
import { pages } from "./routes/pages";
import { vitals } from "./routes/vitals";

const app = new Hono<{ Bindings: Env }>();

app.use(
  secureHeaders({
    // スクリプトは同一オリジンの /app.js・/extract.js だけ。スタイルは HTML に埋め込んだ 1 つだけを nonce で許可する
    contentSecurityPolicy: {
      defaultSrc: ["'none'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
      styleSrc: [NONCE],
      imgSrc: ["'self'"],
      manifestSrc: ["'self'"],
      workerSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
    },
  }),
);
// フォーム送信（urlencoded / multipart / text/plain）は同一オリジンからだけ受け付ける
app.use(csrf());
// 画面と API は商品や共有 URL（space_id）を含むので、端末（bfcache を含む）や中継のキャッシュに残さない。
// キャッシュさせてよい応答（/app.js・/extract.js）は自分で Cache-Control を付ける
app.use(async (c, next) => {
  await next();
  if (!c.res.headers.has("cache-control")) c.res.headers.set("cache-control", "no-store");
});

app.get("/healthz", (c) => c.json({ ok: true }));

app.route("/api/extract", extract);
app.route("/api/space/rotate", rotate);
app.route("/api/vitals", vitals);
// 画面のフォームと JSON API の本文の上限。商品名 100 文字・メモ 500 文字を URL エンコードしても収まる
app.use(bodyLimit({ maxSize: 16 * 1024 }));
app.route("/api", api);

app.route("/", pages);

export default app;
