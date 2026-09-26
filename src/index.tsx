import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { NONCE, secureHeaders } from "hono/secure-headers";

import { api, rotate } from "./routes/api";
import { extract } from "./routes/extract";
import { pages } from "./routes/pages";
import { vitals } from "./routes/vitals";
import { type AppEnv, resolveSpace } from "./space";

const app = new Hono<AppEnv>();

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

// 下の resolveSpace（スペースの発行）より先に登録し、そこへ進ませない
app.route("/api/extract", extract);
app.route("/api/space/rotate", rotate);
app.route("/api/vitals", vitals);
app.use("/api/*", resolveSpace);
app.route("/api", api);

app.route("/", pages);

export default app;
