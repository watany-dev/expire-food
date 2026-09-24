import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";

import { api } from "./routes/api";
import { type AppEnv, resolveSpace } from "./space";

const app = new Hono<AppEnv>();

app.use(secureHeaders());

app.get("/healthz", (c) => c.json({ ok: true }));

// 共有 URL。スペースを Cookie に保存して一覧へ戻す（機種変更・家族共有）
app.get("/s/:spaceId", resolveSpace, (c) => c.redirect("/"));

app.use("/api/*", resolveSpace);
app.route("/api", api);

app.get("/", (c) =>
  c.html(
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>期限メモ</title>
      </head>
      <body>
        <h1>期限メモ</h1>
        <p>準備中です。</p>
      </body>
    </html>,
  ),
);

export default app;
