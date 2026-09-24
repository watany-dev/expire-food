import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { NONCE, secureHeaders } from "hono/secure-headers";

import { api } from "./routes/api";
import { extract } from "./routes/extract";
import { pages } from "./routes/pages";
import { type AppEnv, resolveSpace } from "./space";

const app = new Hono<AppEnv>();

app.use(
  secureHeaders({
    // スクリプトは同一オリジンの /extract.js だけ。スタイルは HTML に埋め込んだ 1 つだけを nonce で許可する
    contentSecurityPolicy: {
      defaultSrc: ["'none'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
      styleSrc: [NONCE],
      imgSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
    },
  }),
);
// フォーム送信（urlencoded / multipart / text/plain）は同一オリジンからだけ受け付ける
app.use(csrf());

app.get("/healthz", (c) => c.json({ ok: true }));

// 共有 URL。スペースを Cookie に保存して一覧へ戻す（機種変更・家族共有）
app.get("/s/:spaceId", resolveSpace, (c) => c.redirect("/"));

// 下の resolveSpace（スペースの発行）より先に登録し、そこへ進ませない
app.route("/api/extract", extract);
app.use("/api/*", resolveSpace);
app.route("/api", api);

app.route("/", pages);

export default app;
