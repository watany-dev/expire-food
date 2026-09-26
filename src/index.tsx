import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
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

app.get("/healthz", (c) => c.json({ ok: true }));

// 下の resolveSpace（スペースの発行）より先に登録し、そこへ進ませない
app.route("/api/extract", extract);
app.route("/api/space/rotate", rotate);
app.route("/api/vitals", vitals);
// 画面のフォームと JSON API の本文の上限。商品名 100 文字・メモ 500 文字を URL エンコードしても収まる
app.use(bodyLimit({ maxSize: 16 * 1024 }));
app.use("/api/*", resolveSpace);
app.route("/api", api);

app.route("/", pages);

export default app;
